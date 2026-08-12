export class MessagePipeline {
  constructor() {
    this.middlewares = []
  }

  // Add a layer to the chain
  use(middleware) {
    this.middlewares.push(middleware)
    return this
  }

  // Execute the chain sequentially
  async execute(ctx) {
    let index = -1

    const next = async () => {
      index++
      if (index < this.middlewares.length) {
        const currentMiddleware = this.middlewares[index]
        await currentMiddleware(ctx, next)
      }
    }

    await next()
  }
}