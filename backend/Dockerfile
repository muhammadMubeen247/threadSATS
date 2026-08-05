FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --only=production

COPY --chown=nonroot:nonroot . .

EXPOSE 3000

CMD ["node" ,"server.js"] 

