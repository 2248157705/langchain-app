import { ChatOllama } from "@langchain/ollama";
import { Client } from "@modelcontextprotocol/sdk/client";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { DynamicStructuredTool, HumanMessage } from "langchain";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import * as z from "zod";
import CallbackHandler from "langfuse-langchain";





process.env.LANGFUSE_DEBUG = "true"; 

// ================= 配置区域 =================
const DB_CONFIG = {
  user: "xgj_db_admin",
  // 原始密码包含特殊字符
  pass: "xgj_db_admin**$#$#1",
  host: "xgj-db-public.rwlb.rds.aliyuncs.com",
  port: "3306",
  name: "xgj-business",
};

const DOCKER_CONTAINER_NAME = "mcp-mysql-server";
// 确保这个路径与我们在 Dockerfile 中设置的一致 (dist)
const MCP_SCRIPT_PATH = "/app/dist/index.js";

const TOOL_PREFIX = "graph-mysql"; // 指定工具前缀

/**
 * 核心修复：将 MCP Schema 转为 Zod，并自动补全缺失的 description
 */
function mcpInputSchemaToZod(schema: any, toolName: string): z.ZodType<any> {
  if (!schema || !schema.properties) {
    // 如果没有参数，允许空对象
    return z.object({});
  }

  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [key, value] of Object.entries<any>(schema.properties)) {
    let zodType: z.ZodTypeAny;

    // 1. 类型映射
    switch (value.type) {
      case "string": zodType = z.string(); break;
      case "integer":
      case "number": zodType = z.number(); break;
      case "boolean": zodType = z.boolean(); break;
      case "array": zodType = z.array(z.any()); break;
      default: zodType = z.any();
    }

    // 2. 补全描述 (这是 Llama 调用工具的关键！)
    let desc = value.description;
    if (!desc) {
      // 针对 mysql mcp 的特定补全
      if (key === 'sql' || key === 'query') {
        desc = "Must be a valid SQL SELECT statement. Example: 'SELECT * FROM users LIMIT 5'";
      } else if (key === 'table_name') {
        desc = "The name of the table to inspect.";
      } else {
        desc = `The value for ${key}`;
      }
    }
    zodType = zodType.describe(desc);

    // 3. 处理可选/必填
    if (!schema.required?.includes(key)) {
      zodType = zodType.optional();
    }

    shape[key] = zodType;
  }

  return z.object(shape);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const msg = searchParams.get("msg");

  if (!msg) return Response.json({ error: "Missing msg parameter" });

  console.log("Request msg:", msg);

  // 1. 构建连接串
  const encodedPass = encodeURIComponent(DB_CONFIG.pass);
  const databaseUrl = `mysql://${DB_CONFIG.user}:${encodedPass}@${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.name}`;

  // 2. 配置 MCP Transport
  const transport = new StdioClientTransport({
    command: "docker",
    args: [
      "exec",
      "-i",
      DOCKER_CONTAINER_NAME,
      "node",
      MCP_SCRIPT_PATH,
      databaseUrl,
    ],
  });

  const client = new Client(
    { name: "langgraph-client", version: "1.0.0" },
    { capabilities: {} }
  );

  let transportConnected = false;
  // Langfuse 配置 (建议放入环境变量，也可以硬编码测试)
const langfuseHandler=new CallbackHandler({
  publicKey: "pk-lf-2436828a-6f66-44f3-a1c8-e0bf96738a13",      // 你的 Public Key
  secretKey: "sk-lf-c4a1eea9-b418-4d0b-8586-ffc713540936",      // 你的 Secret Key
  baseUrl: "http://localhost:7095", // 你的 Docker 部署地址
  tags:['mcp-mysql-test'],
  flushAt:1
})

  try {
    // 3. 连接并获取工具
    await client.connect(transport);
    transportConnected = true;
    console.log("✅ MCP Server 连接成功");

    const mcpToolsList = await client.listTools();

    // 4. 转换工具 (核心修复逻辑)
    const tools = mcpToolsList.tools.map((tool) => {


      // 原始工具名称 (Docker 内部只认这个)
      const originalName = tool.name;
      // LangChain 用的名称
      const langChainName = `${TOOL_PREFIX}_${originalName}`;

      // 生成增强版的 Schema
      const schema = mcpInputSchemaToZod(tool.inputSchema, originalName);

      console.log('originalName:', originalName,)

      // 增强工具描述
      let description = tool.description || "";
      if (!description) {
        if (originalName === 'query') description = "Execute a generic SQL query. Required argument: sql (string).";
        else if (originalName === 'list_tables') description = "List all tables in the database.";
        else description = `Tool to perform ${originalName}`;
      }

      return new DynamicStructuredTool({
        name: langChainName,
        description: description,
        schema: schema,
        func: async (args) => {
          // === 这里的 Log 如果没打印，说明模型根本没进这里 ===
          console.log(`\n🚀 [触发工具] ${langChainName}`);
          console.log(`   [参数] ${JSON.stringify(args)}`);

          try {
            const result = await client.callTool({
              name: originalName, // 传回原始名称
              arguments: args,
            });

            // 提取结果文本
            let output = "";
            if (result.content) {
              const textPart = result.content.find(c => c.type === 'text');
              output = textPart ? textPart.text : JSON.stringify(result.content);
            }

            console.log(`   [返回] 长度: ${output.length} 字符`);
            console.log("⬇️⬇️⬇️ [返回内容详情] ⬇️⬇️⬇️");
            console.log(output);
            console.log("⬆️⬆️⬆️ [返回内容结束] ⬆️⬆️⬆️");
            return output
          } catch (e: any) {
            console.error(`   [错误] ${e.message}`);
            return `Error: ${e.message}`;
          }
        },
      });
    });

    console.log(`🛠️  已加载 ${tools.length} 个工具: ${tools.map((t) => t.name).join(", ")}`);





    // 5. 定义模型
    // 建议：如果 llama3.2 还是不调用，请尝试换成 qwen2.5 (通义千问coder版在工具调用上更强)
    const model = new ChatOllama({
      // model: "qwen2.5-coder:7b", // 推荐: "qwen2.5:7b" 或 "llama3.1"
      model: "llama3.2", // 推荐: "qwen2.5:7b" 或 "llama3.1"
      baseUrl: "http://localhost:11434",
      temperature: 0, // 工具调用场景建议降低温度
  callbacks: [langfuseHandler], 
    });




    const systemPrompt = `你是一个数据库管理员。你拥有查询 MySQL 的工具。

重要规则：
1. **必须使用工具**：回答任何关于数据的问题时，必须调用工具，严禁瞎编。
2. **工具名称**：工具名称前缀是 'graph-mysql_'。
   - 查表结构用: graph-mysql_list_tables
   - 执行SQL用: graph-mysql_query (参数: sql)
3. **SQL 规范**：
   - 必须使用 SELECT 语句。
   - 例子: SELECT * FROM orders;

用户问题: ${msg}`;





    // 7. 创建 Agent
    const agent = createReactAgent({
      llm: model,
      tools: tools,
      stateModifier: systemPrompt,
    });

    // 8. 执行
    const result = await agent.invoke({ messages: [new HumanMessage(msg)]},{callbacks:[langfuseHandler]});

    // 9. 提取结果
    const lastMessage = result.messages[result.messages.length - 1];
    const finalContent = lastMessage.content;

    return Response.json({
      response: finalContent,
      // debug: result.messages.map(m => ({ role: m._getType(), content: m.content }))
    });

  } catch (error: any) {
    console.error("Agent 运行出错:", error);
    return Response.json({ error: error.message }, { status: 500 });
  } finally {
    // 简单清理，虽然在 Serverless/Route Handler 环境中连接可能复用
    // 但显式关闭是个好习惯，或者将其移出函数作用域作为单例
    if (transportConnected) {
      // 注意：Stdio Transport 往往没有完美的 close 方法来 kill docker 进程
      // 这里依赖 node 进程结束自动断开管道
    }
      console.log("正在上传 Langfuse 数据...");
  await langfuseHandler.shutdownAsync();
  console.log("数据上传完成，程序退出");
  }
}