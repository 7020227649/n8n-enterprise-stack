FROM node:20-alpine
RUN apk add --no-cache docker-cli docker-cli-compose
WORKDIR /app
COPY package.json .
RUN npm install
COPY src ./src
CMD ["node","src/app.js"]
