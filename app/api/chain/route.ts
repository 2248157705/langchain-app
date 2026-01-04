import { StringOutputParser } from "@langchain/core/output_parsers"
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts"
import { ChatOpenAI } from "@langchain/openai"
import { HumanMessage, AIMessage } from "@langchain/core/messages"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const message = searchParams.get('message')
  const history = searchParams.get('history')
  console.log('开始请求')

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

  if (!message) {
    return Response.json({ error: 'Message is required' }, { status: 400 });
  }

  let chatHistory = []
  if (history) {
    try {
      const parsedHistory = JSON.parse(history)
      chatHistory = parsedHistory.map((msg: any) => {
        if (msg.role === 'user') {
          return new HumanMessage(msg.content)
        } else if (msg.role === 'assistant') {
          return new AIMessage(msg.content)
        }
        return null
      }).filter(Boolean)
    } catch (error) {
      console.error('解析历史消息失败:', error)
    }
  }

  const chatbotPrompt = ChatPromptTemplate.fromMessages([
    ['system', '你叫苍井空，是日本著名女演员'],
    new MessagesPlaceholder('chat_history'),
    ['user', '{input}'],
  ])

  const basicQaChain = chatbotPrompt.pipe(model).pipe(new StringOutputParser())
  const modleResult = await basicQaChain.invoke({
    input: message,
    chat_history: chatHistory,
  })
  console.log('modleResult', modleResult)

  return Response.json({
    response: modleResult,
  });
}
