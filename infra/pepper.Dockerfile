FROM node:22-alpine
WORKDIR /app
COPY services/pepper/index.mjs ./index.mjs
USER node
EXPOSE 4600
CMD ["node", "index.mjs"]
