import { Column, DataSource, Entity, PrimaryGeneratedColumn, VersionColumn, createConnection } from 'typeorm';
import { add } from './math.js';

console.log(`Hello! The result is: ${add(1, 2)}`);

@Entity()
class Product {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  stock: number;

  @VersionColumn()
  version: number;
}

@Entity()
class Payment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  status: string;

  @VersionColumn()
  version: number;
}

async function optimisitciUpdateFunc(dataSource: DataSource, workerCount?: number) {
  console.log(`[#${workerCount ?? -1}] running...`);
  // 1. Change the payment to success
  // 2. If the payment already success, skip all the logic
  // 3. If not, decrease the stock by one

  try {
    await dataSource.transaction(async (tx) => {
      const paymentRepo = tx.getRepository(Payment);
      const productRepo = tx.getRepository(Product);

      const payment = await paymentRepo.findOneBy({ id: 1 });
      const product = await productRepo.findOneBy({ id: 1 });

      if (!payment || !product) {
        throw new Error('neither payment or product is found.');
      }

      if (payment.status === 'success') {
        throw new Error('could not continue the transaction because payment status is alread success');
      }

      // Decrease the stock by one
      product.stock = product.stock - 1;

      // Set the payment status to 'success'
      payment.status = 'success';

      await paymentRepo.save(payment);
      await productRepo.save(product);
    });

    console.info('the transaction successfully ran');
  } catch (error) {
    console.error('error when running the transaction: ', error);
  }
}

async function insertDummyData(dataSource: DataSource) {
  const productRepo = dataSource.getRepository(Product);
  const paymentRepo = dataSource.getRepository(Payment);

  const newProduct = productRepo.create({
    stock: 5,
  });
  await productRepo.save(newProduct);

  const newPayment = paymentRepo.create({
    status: 'pending',
  });
  await paymentRepo.save(newPayment);
}

async function main() {
  const connection = await createConnection({
    type: 'mariadb',
    host: 'localhost',
    port: 3306,
    username: '',
    password: '',
    database: 'typeorm_optlock_poc',
    entities: [Product, Payment],
    synchronize: true,
    logging: true,
  });

  try {
    // NOTE: you can insert the data first before simulating concurrent update
    // insertDummyData(connection);

    const ops = Array(3)
      .fill(null)
      .map((_, i) => optimisitciUpdateFunc(connection, i));

    await Promise.all(ops);
  } catch (error) {
    console.error({ error });
  } finally {
    await connection.close();
  }
}
main();
