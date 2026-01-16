
import { StateGraph,START,END, Annotation, InMemoryStore, MemorySaver } from "@langchain/langgraph"
import {createReactAgent} from '@langchain/langgraph/prebuilt'
import { ChatOllama } from "@langchain/ollama"
import { BaseMessage, createAgent, HumanMessage, SystemMessage } from "langchain"
import * as z from "zod"
export async function GET(req:Request){
    const {searchParams}=new URL(req.url)
    const message=searchParams.get('message')

const StateSchema=z.object({
    x:z.number(),
    val:z.string()
})


const UserStateSchema=Annotation.Root({
    message:Annotation<BaseMessage[]>({
        reducer:(x,y)=>x.concat(y),
        default:()=>[]
    })
})

type UserState=typeof UserStateSchema.State



type State=z.infer<typeof StateSchema>

const add=(state:State):Partial<State>=>{
    console.log('加法节点',state)
    return {x:state.x+1}
}

const sub=(state:State):Partial<State>=>{
    console.log('减法节点:',state)
    return {x:state.x-6}
}

const judges=(state:State):string=>{

    return state.x>0?'hello':'world'
}

const sayHello=(state:State):Partial<State>=>{
    console.log('sayHello')
    return {val:'success'}
}
const sayWorld=(state:State):Partial<State>=>{
    console.log('sayWorld')
      return {val:'fail'}
}






// 1. 定义状态 schema (Pydantic BaseModel → Annotation.Root + Zod)
const BranchLoopStateSchema =   z.object({
    x: z.number(),           // int → number
    done: z.boolean().optional().default(false),  // Optional[bool] → optional boolean
  });
type BranchLoopState = z.infer<typeof BranchLoopStateSchema>;

// 2. 节点函数 (返回 Partial 更新)
const check_x = (state: BranchLoopState): Partial<BranchLoopState> => {
  console.log(`[check_x] 当前 x = ${state.x}`);
  return {};  // 无状态变更
};

const increment = (state: BranchLoopState): Partial<BranchLoopState> => {
  console.log(`[increment] x 是偶数，执行 +1 → ${state.x + 1}`);
  return { x: state.x + 1 };
};

const done_node = (state: BranchLoopState): Partial<BranchLoopState> => {
  console.log(`[done_node] x 是奇数，流程结束`);
  return { done: true };
};

// 3. 条件函数 (返回节点名字符串)
const is_even = (state: BranchLoopState): string => {
  return state.x % 2 === 0 ? 'increment' : 'done_node';
};

// 4. 构建图
const builder = new StateGraph(BranchLoopStateSchema)
  .addNode("check_x", check_x)
  .addNode("increment", increment)
  .addNode("done_node", done_node)
  
   .addEdge(START, "check_x")
  // 条件分支：偶数 → increment，奇数 → done_node
  .addConditionalEdges("check_x", is_even)
  
  // 循环：increment → check_x
  .addEdge("increment", "check_x")
  
  // 起始/结束
 
  .addEdge("done_node", END);


  const forGraph=builder.compile()
  forGraph.invoke({x:Number(message),done:false})



  




const model=new ChatOllama({
    model:'llama3.2',
    baseUrl:'http://localhost:11434'
})


const checkpointer=new MemorySaver()

const ask= new HumanMessage({content:[{type:'text',text:'question'}]})










const call_model=async(state:UserState):Promise<Partial<UserState>>=>{
    const system_prompt=new SystemMessage('你是一个数据分析师，可以依据用户提问产生回答')
    const response=await model.invoke([
        system_prompt,
        ...state.message
    ])
    return {message:[response]}
}

const should_continue=(state:UserState):string=>{
    const message=state.message
    const last_message=message[message.length-1]
    if(!last_message||!last_message.tool_calls?.length){
        return 'end'
    }
    return 'continue'
}

const chatBuilder=new StateGraph(UserStateSchema)
    .addNode('agent',call_model)
    .addEdge(START,'agent')
    .addConditionalEdges('agent',should_continue,{end:END,continue:'agent'})















const buildGraph=new StateGraph(StateSchema)
    .addNode('add',add)
    .addNode('sub',sub)
    .addNode('hello',sayHello)
    .addNode('world',sayWorld)
    .addEdge(START,'add')
    .addEdge('add','sub')
    .addConditionalEdges('sub',judges,{hello:'hello',world:'world'})
    .addEdge('hello',END)
    .addEdge('world',END)
    

    const graph=buildGraph.compile({checkpointer})
    const result=await graph.invoke({x:Number(message),val:''})

  

    // console.log('nodes:',buildGraph.nodes)
    // console.log('edges:',buildGraph.edges)

    return Response.json({message,result})
}