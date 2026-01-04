import { ChatOllama } from '@langchain/ollama';
import { HumanMessage } from '@langchain/core/messages';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate, PromptTemplate } from '@langchain/core/prompts';

export async function POST(request: Request) {
  try {
    const { message } = await request.json();

    if (!message) {
      return Response.json({ error: 'Message is required' }, { status: 400 });
    }
    console.log('开始请求')


    const llm = new ChatOllama({
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      model: process.env.OLLAMA_MODEL || 'llama2',
      temperature: 0.7,
    });

    const response = await llm.invoke([new HumanMessage(message)]);

    

    console.log('response',response)




    const model = new ChatOpenAI({
      model:'llama3.2',
      apiKey: "EMPTY",                                      // 或 "" 禁用认证
      baseURL: "http://localhost:11434/v1",                 // 完整 Ollama OpenAI 端点（无环境变量覆盖）
      timeout: 600000,                                       // 可选：增加超时（本地模型较慢）
      temperature: 0.7,
      configuration: {                                       // 关键：禁用 OpenAI 默认行为
        organization: undefined,
        baseURL: "http://localhost:11434/v1",               // 双重确保
      },
      // apiKey:'ollama',
      // temperature: 0.7,
      // baseURL:(process.env.OLLAMA_BASE_URL || 'http://localhost:11434') + "/v1",
      // baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    })
    const basicQaChain=model.pipe(new StringOutputParser())
    const question='介绍一下你自己'
    const modleResult=await basicQaChain.invoke(question)
    console.log('modleResult',modleResult)



    const promptTemplate= ChatPromptTemplate.fromMessages([
      ['system','你是一个专业的前端'],
      ['user','这是用户的问题{question},请用 yes或 no 来回答'],
    ])

    const booQaChain=promptTemplate.pipe(model).pipe(new StringOutputParser())
    const question2='请问1+1是否大于2?'
    const result33=await booQaChain.invoke({question:question2})
    console.log('result33',result33)



    return Response.json({ 
      response: response.content.toString() 
    });
  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: 'Failed to process request' }, { status: 500 });
  }
}
