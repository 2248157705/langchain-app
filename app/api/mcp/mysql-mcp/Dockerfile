FROM node:20-alpine

RUN apk add --no-cache git

WORKDIR /app

# 1. 拉取代码
RUN git clone https://github.com/yuru-sha/mcp-server-mysql.git .

# 2. 安装依赖并构建
RUN npm install
# 忽略脚本错误以防止 husky 等钩子报错，并执行构建
RUN npm run build --if-present

# 3. (调试步骤) 打印目录结构，这样构建时能在终端看到到底生成了什么文件夹
RUN echo "=== Directory Listing ===" && ls -F && echo "=== Dist Listing ===" && ls -F dist/ || echo "No dist folder"

# 4. 启动命令：修改为 dist/index.js
CMD ["node", "dist/index.js"]