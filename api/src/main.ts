import express, { Request, Response } from 'express';

const host = process.env.HOST ?? 'localhost';
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

const app = express();

app.get('/', (req: Request, res: Response) => {
  res.send({ message: 'Hello API' });
});

app.listen(port, () => {
  console.log(`[ ready ] http://${host}:${port}`);
});
