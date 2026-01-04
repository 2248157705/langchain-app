import { ChatOllama } from "@langchain/ollama";
import { tool } from '@langchain/core/tools';
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage } from '@langchain/core/messages';
import { z } from "zod"; // 建议引入 zod 做参数校验（LangChain 推荐）

// ================= 1. 定义接口和工具 =================

interface WalletInfoResult {
  balance: number;
  guaranteeAmount: number;
  creditLimit: number;
}

/**
 * 定义工具
 * 注意：LangChain 推荐使用 zod schema 来描述参数，这样 LLM 能更准确地理解参数类型
 */
const walletTool = tool(
  async ({ token }: { token: string }): Promise<WalletInfoResult> => {
    console.log(`[Tool] 正在调用钱包查询, Token: ${token ? token.slice(0, 10) + '...' : '无'}`);
    
    const url = 'https://testenv.huanjintech.com/api/gtw/xgj-mall-api/t-customer-wallet/get-wallet-info';
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': token
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        // 返回错误字符串而不是抛出异常，可以让 Agent 知道发生了错误并尝试自我修正或告知用户
        throw new Error(`API请求失败: ${response.status}`);
      }

      const data = await response.json();
      console.log(`[Tool] 查询成功, 余额:`, data.data?.balance);

      return {
        balance: data.data?.balance || 0,
        guaranteeAmount: data.data?.guaranteeAmount || 0,
        creditLimit: data.data?.creditLimit || 0,
      };
    } catch (error) {
      console.error('[Tool] 错误:', error);
      throw new Error(`获取用户钱包信息失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
  {
    name: "get_user_walletInfo",
    description: "查询用户钱包资金。返回数据包含三个核心字段：balance(账户余额)、guaranteeAmount(保证金)、creditLimit(授信金额/信用额度)。必须提供 token。",
    schema: z.object({
      token: z.string().describe("用户的认证 Token"),
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
    const tools = [walletTool];

    // 3. 构建 System Prompt
    // 关键修复：这里不要包含 {input}，只包含角色设定和上下文
    const systemInstruction = `你是一个专业的金融助手，擅长查询用户钱包信息。

当前用户的 Token 为：${token || "未提供(请提示用户需要登录)"}

工具调用规则：
1. 当用户询问"余额"、"钱包"、"资金"等问题时，必须调用 'get_user_walletInfo' 工具。
2. 调用工具时，必须使用上述提供的 Token。
3. 如果 Token 为空，请直接礼貌地回复用户需要授权登录。
4. 收到工具返回的数据后，请用自然的中文汇总回答用户的资金情况。

数据解读规则（收到工具结果后务必遵守）：
- **balance** 代表 **账户余额**
- **guaranteeAmount** 代表 **保证金**
- **creditLimit** 代表 **授信金额** (这是用户最关心的授信额度)
`;

    // 4. 创建 Agent (使用 LangGraph prebuilt)
    // stateModifier 会自动被转化为 SystemMessage 插入到消息队列的最前面
    const agent = createReactAgent({
      llm: model,
      tools: tools,
      stateModifier: systemInstruction, 
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
      messages: result.messages.map((m: any) => ({
        role: m._getType(), // 获取消息角色 (human, ai, tool)
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      })),
    });

  } catch (error: any) {
    console.error('系统错误:', error);
    return Response.json({ 
      error: 'Failed to process request', 
      details: error.message 
    }, { status: 500 });
  }
}