require('dotenv').config();

const express             = require('express');
const { ApolloServer }    = require('apollo-server-express');

const typeDefs  = require('./graphql/schema');
const resolvers = require('./graphql/resolvers');
const restRoutes = require('./rest/routes');

const PORT = process.env.PORT || 3000;

async function main() {
  const app = express();

  // ─── Body parsing ───────────────────────────────────────────────────────────
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // ─── REST routes ────────────────────────────────────────────────────────────
  app.use('/', restRoutes);

  // ─── GraphQL (Apollo Server v3) ─────────────────────────────────────────────
  const apolloServer = new ApolloServer({
    typeDefs,
    resolvers,
    // Show friendly errors in development
    formatError: (err) => {
      console.error('[GraphQL Error]', err.message);
      return err;
    },
  });

  await apolloServer.start();
  apolloServer.applyMiddleware({ app, path: '/graphql' });

  // ─── Global error handler ───────────────────────────────────────────────────
  app.use((err, req, res, _next) => {
    console.error('[Gateway Error]', err.message);
    const grpcCodeMap = { 3: 400, 5: 404, 6: 409, 9: 409 };
    const status = grpcCodeMap[err.code] || 500;
    res.status(status).json({ success: false, message: err.details || err.message });
  });

  // ─── Start server ───────────────────────────────────────────────────────────
  app.listen(PORT, () => {
    console.log(`[API Gateway] REST  → http://localhost:${PORT}`);
    console.log(`[API Gateway] GraphQL → http://localhost:${PORT}/graphql`);
  });
}

main().catch((err) => {
  console.error('[API Gateway] Fatal startup error:', err.message);
  process.exit(1);
});
