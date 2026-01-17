import { Annotation, Command, END, interrupt, MemorySaver, START, StateGraph } from "@langchain/langgraph"
import { ChatOllama } from "@langchain/ollama"
import * as z from "zod"


// --- 🔥 核心修改开始：强制使用全局单例 MemorySaver ---
// 这样保证 review 和 replay 路由使用的是同一块内存
const globalForLangGraph = global as unknown as { checkpointer: MemorySaver };

const checkpointer =
    globalForLangGraph.checkpointer || new MemorySaver();

if (process.env.NODE_ENV !== "production") {
    globalForLangGraph.checkpointer = checkpointer;
}
// --- 🔥 核心修改结束 ---

export function getApp(){
    const EmailSchema = z.object({
        intent: z.enum(['question', 'bug', 'billing', 'feature', 'complex']).describe('邮件意图分类'),
        urgency: z.enum(['low', 'medium', 'high', 'critical']).describe('紧急程度'),
        topic: z.string().describe('邮件主题'),
        summary: z.string().describe('邮件摘要')
    })

    type Email = z.infer<typeof EmailSchema>
    const EmailState = Annotation.Root({
        email_content: Annotation<string>(),
        send_email: Annotation<string>(),
        email_id: Annotation<string>(),
        email: Annotation<Email>(),
        ticket_id: Annotation<string | null>({
            default: () => null,
            reducer: (pre, next) => next ?? pre,
        }),
        search_results: Annotation<string[]>({
            reducer: (x, y) => (y ? y : x), // 覆盖逻辑
            default: () => [],
        }),
        customer_history: Annotation<Record<string, any> | null>({
            default: () => null,
            reducer: (pre, next) => next ?? pre
        }),

        draft_response: Annotation<string | null>({
            default: () => null,
            reducer: (pre, next) => next ?? pre,
        })
    })

    type State = typeof EmailState.State
    const model = new ChatOllama({
        model: 'llama3.2',
        temperature: 0,
        baseUrl: 'http://localhost:11434',
    })


    const readEmial = (state: State): Partial<State> => {
        console.log('读取邮件')
        return {}
    }
    const categoryEmail = async (state: State): Promise<Partial<State>> => {
        console.log('分类邮件')
        const structLLM = model.withStructuredOutput(EmailSchema)
        const prompt = `分析用户输入的邮件进行分类
        邮件：${state.email_content}
        来自:${state.send_email}
        提供分类，紧急程度，主题，和内容摘要
        `
        const email = await structLLM.invoke(prompt)
        return {
            email
        }
    }

    const search_document = async (state: State): Promise<Partial<State>> => {
        console.log('查询知识库')
        const { intent, topic } = state.email
        const search_results = [
            `关于${topic} 的处理流程文档`,
            `关于${intent} 问题的常见回答(FAQ)`
        ]
        return {
            search_results,
        }
    }

    const bug_tracking = (state: State): Partial<State> => {
        console.log('生成BUG单')
        const ticket_id = `BUG-${Date.now()}`
        return { ticket_id }
    }
    const write_response = async (state: State): Promise<Command<State>> => {
        console.log('生成草稿')
        const { email, search_results, customer_history } = state
        const context = []
        if (search_results?.length > 0) {
            context.push(`相关内容:\n${search_results.map(d => `- ${d}`).join("\n")}`);
        }
        if (customer_history) {
            context.push(`客户等级: ${customer_history.tier || 'standard'}`);
        }

        const draft_prompt = `撰写50字以内的邮件回复:
        邮件内容:${state.email_content}
        邮件分类:${email.intent}
        紧急程度:${email.urgency}
        ${context.join('\n')}
        `
        const response = await model.invoke(draft_prompt)
        const needs_review = ['high', 'critical'].includes(email.urgency) || email.intent === 'complex'
        const goto = needs_review ? 'human_review' : 'send_reply'
        if (needs_review) {
            console.log('⚠️ 需要人工审核')
        }
        return new Command({ update: { draft_response: response.content }, goto })

    }

    const human_review = (state: State): Command<State> => {
        console.log('人工审核')
        const descision = interrupt({
            email_id: state.email_id,
            draft: state.draft_response,
            urgency: state.email.urgency,
            instruction: `请核对回复内容，输入 'approved' 同意发送，或输入其他内容拒绝。`
        })

        console.log('等待审核结果',descision)
        if (descision === 'approved') {
            console.log("✅ 审核通过，继续发送邮件");
            return new Command({ goto: 'send_reply' })
        } else {
            console.log("❌ 审核未通过，流程终止");
            return new Command({ goto: END })
        }
    }


    // 发送回复节点
    const send_reply = (state: State) => {
        console.log("---✅ 成功发送邮件---");
        console.log(`收件人: ${state.send_email}`);
        console.log(`内容: ${state.draft_response}`);
    };

    const builder = new StateGraph(EmailState)

           .addNode('read_email', readEmial)
        .addNode('category_email', categoryEmail)
        .addNode('search_document', search_document)
        .addNode('bug_tracking', bug_tracking)
        .addNode('write_response', write_response, { ends: ['human_review', 'send_reply'] })
        .addNode('human_review', human_review, { ends: ['send_reply', END] }) // 确保这里 ends 定义正确
        .addNode('send_reply', send_reply)
        .addEdge(START, 'read_email')
        .addEdge('read_email', 'category_email')
        .addEdge('category_email', 'search_document')
        .addEdge('category_email', 'bug_tracking')
        .addEdge('search_document', 'write_response')
        .addEdge('bug_tracking', 'write_response')
        .addEdge('send_reply', END)
        // .addNode('read_email', readEmial)
        // .addNode('category_email', categoryEmail)
        // .addNode('search_document', search_document)
        // .addNode('bug_tracking', bug_tracking)
        // .addNode('write_response', write_response, {
        //     ends: ['human_review', 'send_reply']
        // })
        // .addNode('human_review', human_review, {
        //     ends: ['send_reply', END]
        // })

        // .addNode('send_reply', send_reply)
        // .addEdge(START, 'read_email')
        // .addEdge('read_email', 'category_email')
        // .addEdge('category_email', 'search_document')
        // .addEdge('category_email', 'bug_tracking')
        // .addEdge('search_document', 'write_response')
        // .addEdge('bug_tracking', 'write_response')
        // .addEdge('send_reply', END)

 
    const app = builder.compile({ checkpointer })
    console.log('初始化APP')
    return app
}



export async function GET(req: Request) {
    const { searchParams } = new URL(req.url)
    const msg = searchParams.get('msg')
    console.log('收到邮件:', msg)


    const app=getApp()
      // 这里的 thread_id 必须和 replay 中一致
    const config = { configurable: { thread_id: '123' } };

    const response = await app.invoke({
        email_id: '123',
        send_email: 'customer@example.com',
        email_content: msg!
        // email_content:'你好，我需要知道处理我的问题的流程。',
        //  email_content: "我遇到了一个紧急bug, 有客户重复订阅了一个产品",
    }, config)



      // 检查是否被 interrupt 中断
    // 注意：LangGraph JS 的返回值中，如果暂停，snapshot 会包含 interrupt 信息
    // 但 invoke 直接返回的是最后的状态。要检测是否暂停，通常需要检查 snapshot
    // 或者根据 snapshot.next 状态判断。
    // 在 invoke 模式下，如果触发 interrupt，它会完成当前节点并抛出暂停。
    
    // 获取当前状态快照以检查是否有 interrupt
    const snapshot = await app.getState(config);
    
    // if (snapshot.tasks.length > 0 && snapshot.tasks[0].interrupts.length > 0) {
    //     const interruptValue = snapshot.tasks[0].interrupts[0].value;
    //     console.log("\n🛑 流程暂停，等待人工审核:", interruptValue);
    //     return Response.json({
    //         status: "paused",
    //         msg: "等待人工审核",
    //         interrupt_info: interruptValue,
    //         thread_id: '123'
    //     });
    // } else {
    //     console.log("\n流程结束。");
    //     return Response.json({
    //         status: "finished",
    //         msg: response.draft_response,
    //         isEnd: true
    //     });
    // }

    if (snapshot.next.length > 0) {
        console.log("⏸️ 流程已暂停，等待审批。当前节点:", snapshot.next);
        return Response.json({ status: "paused", next: snapshot.next });
    }

    return Response.json({ status: "done", msg: response.draft_response });


    // // 检查是否被 interrupt 中断
    // if (response.__interrupt__) {
    //     const interruptValue = response.__interrupt__[0].value;
    //     console.log("\n🛑 收到人工审核请求:", interruptValue);
    //     return Response.json({
    //         msg: "等待人工审核",
    //         data: interruptValue,
    //         isEnd: false
    //     });
    // } else {
    //     console.log("\n流程结束。");
    //     return Response.json({
    //         msg: response.draft_response,
    //         isEnd: true
    //     });
    // }

}