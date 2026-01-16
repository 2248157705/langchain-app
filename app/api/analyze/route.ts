// app/api/analyze/route.ts
import { NextResponse } from 'next/server';
import { chromium } from 'playwright';
import { ChatOpenAI } from '@langchain/openai'; // 或使用 ChatOllama
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { ChatOllama } from '@langchain/ollama';

// 强制使用 Node.js Runtime (Playwright 无法在 Edge Runtime 运行)
export const runtime = 'nodejs';
// 设置较长的超时时间，因为抓取和分析都需要时间
export const maxDuration = 60; 

export async function GET(request: Request) {
    const {searchParams}=new URL(request.url)
    const url=searchParams.get('url')

  if (!url) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 });
  }

  let browser = null;
  
  try {
    // ================= 1. Playwright 抓取网页 =================
    console.log(`正在启动浏览器抓取: ${url}`);
    
    browser = await chromium.launch({
      headless: true, // 无头模式
    });
    
    const page = await browser.newPage();
    
    // 设置一些 User-Agent 防止被简单的反爬虫拦截
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
    });

    // 访问页面，等待网络空闲 (确保动态内容加载完毕)
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    // 提取主要文本内容 (这里做一个简单的清洗)
    // 实际生产中可以使用 'readability' 库来提取正文
    const content = await page.evaluate(() => {
      // 移除脚本、样式、导航、页脚等无关元素
      const selectorsToRemove = ['script', 'style', 'nav', 'footer', 'iframe', '.ad', '.advertisement'];
      selectorsToRemove.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => el.remove());
      });
      return document.body.innerText; // 获取纯文本
    });

    console.log(`抓取完成，文本长度: ${content.length}`);

    // 如果内容太长，截取前 15000 个字符 (防止爆 Token，或者使用 map-reduce 链处理长文)
    const truncatedContent = content.slice(0, 15000); 

    await browser.close();
    browser = null;

    // ================= 2. LangChain 分析内容 =================
    
    // 配置模型 (这里用 OpenAI，你可以换成 ChatOllama)
    /*
    const model = new ChatOpenAI({
      modelName: 'llama3.2', // 推荐使用支持长上下文的模型
      temperature: 0.7,
      // openAIApiKey: process.env.OPENAI_API_KEY, 
    });
    */

    // 如果想用 Ollama:
    
    const model = new ChatOllama({
      model: "llama3.2",
      baseUrl: "http://localhost:11434",
    });
    

    const promptTemplate = PromptTemplate.fromTemplate(`
      你是一个高级网页分析师。请分析以下网页抓取的内容，并生成一份专业的网页报告。
      
      【网页内容片段】
      {content}
      
      【报告要求】
      1. **网页摘要**: 用 3 句话概括网页核心主题。
      2. **关键信息提取**: 列出 3-5 个关键点 (Key Takeaways)。
      3. **用户意图分析**: 这个网页是用来做什么的？(销售、资讯、技术文档等)。
      4. **情感/风格分析**: 网页的语气是严肃的、幽默的还是营销性质的？
      5. **Markdown 格式输出**: 请使用 Markdown 格式美化报告。
      
      请开始生成报告：
    `);

    const chain = promptTemplate.pipe(model).pipe(new StringOutputParser());

    console.log('正在生成 AI 报告...');
    const report = await chain.invoke({
      content: truncatedContent,
    });

    return NextResponse.json({ report });

  } catch (error: any) {
    console.error('处理失败:', error);
    if (browser) await browser.close();
    return NextResponse.json({ error: error.message || 'Failed to analyze page' }, { status: 500 });
  }
}