import { ChatOllama } from "@langchain/ollama";
import { tool } from '@langchain/core/tools';
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage } from '@langchain/core/messages';
import { z } from "zod"; // 建议引入 zod 做参数校验（LangChain 推荐）
import mysql from 'mysql2/promise'

const dbConfig={
    host: 'xgj-db-public.rwlb.rds.aliyuncs.com',
    port: 3306,
    user: 'xgj_db_admin',
    password: '',
    database: 'xgj-business',
    connectionLimit: 10,
}

const pool=mysql.createPool(dbConfig)
const jsonReplacer=(key:string,value:any)=>{
    if(typeof value==='bigint'){
        return value.toString()
    }
    return value
}


// ================= 工具 1: 执行 SQL 查询 =================
export const executeSqlTool = tool(
  async ({ query }: { query: string }) => {
    console.log(`[MySQL Tool] 执行查询: ${query}`);

    // 🔒 安全检查：简单的防删库检测
    // 真正的安全应该在数据库用户权限层面控制（只给 SELECT 权限）
    const lowerQuery = query.trim().toLowerCase();
    if (!lowerQuery.startsWith('select') && !lowerQuery.startsWith('show') && !lowerQuery.startsWith('describe')) {
      throw new Error("安全警告: 为了系统安全，本工具仅允许执行 SELECT/SHOW/DESCRIBE 查询语句。");
    }

    let connection;
    try {
        console.log('开始连接数据库-executeSqlTool')
      connection = await pool.getConnection();
      const [rows] = await connection.query(query);
      
      // 将结果转换为字符串返回给 LLM
      // 如果结果集太大，建议截断，否则会撑爆 LLM 的上下文窗口
      const resultStr = JSON.stringify(rows, jsonReplacer);
      
      if (resultStr.length > 5000) {
        return `查询结果过长 (长度: ${resultStr.length})，请优化 SQL 添加 LIMIT 限制。部分数据: ${resultStr.slice(0, 5000)}...`;
      }
      
      return resultStr || "查询成功，结果为空。";

    } catch (error: any) {
      console.error("[MySQL Error]", error);
      return `SQL执行出错: ${error.message}`;
    } finally {
      if (connection) connection.release(); // 释放连接回池
    }
  },
  {
    name: "execute_sql",
    description: "执行 MySQL 查询语句。仅支持 SELECT 语句。如果不知道表结构，请先使用 get_database_schema 工具查看。",
    schema: z.object({
      query: z.string().describe("要执行的 SQL 查询语句，例如: SELECT * FROM users LIMIT 5"),
    }),
  }
);

// ================= 工具 2: 获取表结构 (对 Agent 非常重要) =================
export const getSchemaTool = tool(
  async ({ table_name }: { table_name?: string }) => {
    let connection;
    try {
                console.log('开始连接数据库-getSchemaTool')
      connection = await pool.getConnection();
      
      if (table_name) {
        // 查看特定表的结构
        const [rows] = await connection.query(`DESCRIBE ${mysql.escapeId(table_name)}`);
        return JSON.stringify(rows, jsonReplacer);
      } else {
        // 查看所有表名
        const [rows] = await connection.query("SHOW TABLES");
        return `数据库中的表列表: ${JSON.stringify(rows, jsonReplacer)}. 请使用本工具传入 table_name 参数查看具体字段结构。`;
      }
    } catch (error: any) {
      return `获取结构失败: ${error.message}`;
    } finally {
      if (connection) connection.release();
    }
  },
  {
    name: "get_database_schema",
    description: "获取数据库的表结构信息。可以查询所有表名，或者查询特定表的字段定义。",
    schema: z.object({
      table_name: z.string().optional().describe("如果不填则返回所有表名；如果填了表名，则返回该表的字段详情。"),
    }),
  }
);


// ================= 2. API 路由处理 =================

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const message = searchParams.get('message');
  const token = searchParams.get('token');

  if (!message) {
    return Response.json({ error: 'Message parameter is required' }, { status: 400 });
  }

  try {
    console.log('------- 开始新的请求 -------');
    console.log('用户提问:', message);

    // 1. 初始化模型 (使用 @langchain/ollama)
    const model = new ChatOllama({
      model: "llama3.2", 
      baseUrl: "http://localhost:11434", // 这里的 baseUrl 不需要 /v1 后缀
      temperature: 0.5,
    });

    // 2. 准备工具列表
    const tools = [executeSqlTool,getSchemaTool];

    // 系统提示词：教 AI 如何像个 DBA 一样思考
    const systemPrompt = `你是一个高级数据库助手，拥有查询 MySQL 数据库的权限。

工作流程：
1. **不要猜测表名**。如果用户的问题涉及数据库查询，首先调用 'get_database_schema' 查看有哪些表。
2. 找到相关的表后，再次调用 'get_database_schema' (传入 table_name) 查看具体的字段定义。
3. 根据字段结构编写正确的 SQL 语句，并调用 'execute_sql'。
4. SQL 规则：
   - 必须使用 LIMIT 限制返回行数（默认 LIMIT 10），防止数据量过大。
   - 只能执行 SELECT 查询。
5. 根据查询结果回答用户问题。`;

    // 4. 创建 Agent (使用 LangGraph prebuilt)
    // stateModifier 会自动被转化为 SystemMessage 插入到消息队列的最前面
    const agent = createReactAgent({
      llm: model,
      tools: tools,
     stateModifier: systemPrompt,
    });

    // 5. 执行 Agent
    // 传入 messages 数组，LangGraph 会自动处理对话流
    const result = await agent.invoke({
      messages: [new HumanMessage(message)],
    });

    // 6. 提取最终回复
    // result.messages 包含了完整的对话历史（Human -> AI(ToolCall) -> Tool -> AI(Final)）
    const lastMessage = result.messages[result.messages.length - 1];
    const finalContent = lastMessage.content;

    console.log('最终回复:', finalContent);

    return Response.json({
      response: finalContent,
      // 过滤掉中间复杂的对象，只返回简单的聊天记录供前端展示
    //   messages: result.messages.map((m: any) => ({
    //     role: m._getType(), // 获取消息角色 (human, ai, tool)
    //     content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
    //   })),
    });

  } catch (error: any) {
    console.error('系统错误:', error);
    return Response.json({ 
      error: 'Failed to process request', 
      details: error.message 
    }, { status: 500 });
  }
}