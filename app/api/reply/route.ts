import { getApp } from "../review/route"
import {  Command } from "@langchain/langgraph"

export async function GET(req:Request){
    const {searchParams}=new URL(req.url)
    const msg=searchParams.get('msg')
    const app=getApp()
    console.log('收到审批:',msg)
    // const finalResult=await app.invoke(new Command({ resume:msg }),{ configurable: { thread_id: '123' } })
    // console.log('finalResult:',finalResult)
    // return Response.json({msg,replay:true})

      const config = { configurable: { thread_id: '123' } }
     // 1. 🔍 调试：先检查内存里有没有这个线程
    const state = await app.getState(config)
    
    // 如果 values 是空的，说明内存丢失了，或者 thread_id 不对
    if (!state || Object.keys(state.values).length === 0) {
        console.error("❌ 错误: 找不到线程 123 的状态。请先访问 /review 触发流程，并确保 MemorySaver 是单例。")
        return Response.json({ error: "Thread not found or memory lost" })
    }

    console.log("✅ 找到挂起的线程，当前节点:", state.next)

    // 2. ▶️ 恢复流程
    // 注意：resume 的值将直接赋给 human_review 中 interrupt() 的返回值 (descision)
    const finalResult = await app.invoke(
        new Command({ resume: msg }), 
        config
    )

    console.log('✅ 流程恢复执行完毕')
    
    return Response.json({ 
        action: "resumed",
        decision: msg,
        final_state: finalResult 
    })
}