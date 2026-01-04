import { ChatOllama } from '@langchain/ollama';
import { HumanMessage } from '@langchain/core/messages';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate, PromptTemplate } from '@langchain/core/prompts';
import { tool } from '@langchain/core/tools'
import { AIMessage } from '@langchain/core/messages'


interface WalletInfoResult {
  balance: number;
  guaranteeAmount: number;
  creditLimit: number;
}

@tool
export async function get_user_walletInfo(token: string): Promise<WalletInfoResult> {
  /*
  查询用户余额函数
  参数:
    token: 必要参数，字符串类型，用于表示用户token
  返回：
    用户资金的结果，包含余额，保证金额，授信余额等重要信息
  API: https://testenv.huanjintech.com/api/gtw/xgj-mall-api/t-customer-wallet/get-wallet-info
  */
  const url = 'https://testenv.huanjintech.com/api/gtw/xgj-mall-api/t-customer-wallet/get-wallet-info'
  const heads = {
    'Content-Type': 'application/json',
    'Authorization': token
  }
  try {

    const response = await fetch(url, {
      method: 'POST',
      headers: heads,
      body: JSON.stringify({}),
    })
    if (!response.ok) {
      throw new Error(`获取用户钱包信息失败, 状态码: ${response.status}`)
    }
    const data = await response.json()
    console.log(`余额:`, data.data.balance)
    const result: WalletInfoResult = {
      balance: data.data.balance || 0,
      guaranteeAmount: data.data.guaranteeAmount || 0,
      creditLimit: data.data.creditLimit || 0,
    };
    return result
  } catch (error) {
    throw new Error(`获取用户钱包信息失败', ${error}`)
  }

}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const message = searchParams.get('message')
  const token = searchParams.get('token')
  try {
    console.log('开始请求', message)

    const model = new ChatOpenAI({
      model: 'llama3.2',
      apiKey: "EMPTY",
      baseURL: "http://localhost:11434/v1",
      timeout: 600000,
      temperature: 0.7,
      configuration: {
        organization: undefined,
        baseURL: "http://localhost:11434/v1",
      },
    })

    console.log('工具名称', get_user_walletInfo.name)
    console.log('工具描述', get_user_walletInfo.description)
    console.log('工具参数:', JSON.stringify(get_user_walletInfo.args, null, 2))

    const tools = [get_user_walletInfo]
    const llmWithTools = model.bindTools(tools)
    
    const prompt = ChatPromptTemplate.fromMessages([
      ['system', '你是一个智能助手，可以使用工具来查询用户钱包信息。当用户询问余额或钱包信息时，使用 get_user_walletInfo 工具查询。'],
      ['user', '{input}'],
    ])

    const chain = prompt.pipe(llmWithTools)
    const result = await chain.invoke({ input: message })
    
    console.log('LLM 响应:', result)

    let toolCalls = (result as AIMessage).tool_calls
    let finalResponse = result

    if (toolCalls && toolCalls.length > 0) {
      console.log('检测到工具调用:', toolCalls)
      
      for (const toolCall of toolCalls) {
        if (toolCall.name === 'get_user_walletInfo') {
          console.log('调用工具 get_user_walletInfo')
          
          const toolArgs = toolCall.args as { token?: string }
          const tokenToUse = toolArgs.token || token
          
          if (!tokenToUse) {
            console.error('缺少 token 参数')
            continue
          }
          
          try {
            const walletInfo = await get_user_walletInfo.invoke(tokenToUse)
            console.log('钱包信息:', walletInfo)
            
            const toolMessage = new AIMessage({
              content: `查询结果：余额 ${walletInfo.balance}，保证金额 ${walletInfo.guaranteeAmount}，授信余额 ${walletInfo.creditLimit}`,
              tool_call_id: toolCall.id,
            })
            
            finalResponse = await llmWithTools.invoke([
              new HumanMessage(message),
              result as AIMessage,
              toolMessage,
            ])
          } catch (walletError) {
            console.error('钱包查询失败:', walletError)
          }
        }
      }
    }

    return Response.json({ 
      response: finalResponse.content.toString(),
      toolCalls: toolCalls,
    });
  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: 'Failed to process request' }, { status: 500 });
  }
}
