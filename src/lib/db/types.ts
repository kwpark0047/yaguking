import type postgres from 'postgres';

/**
 * 트랜잭션 안/밖에서 같은 쿼리 함수를 쓸 수 있게 하는 공통 타입.
 * 모든 쓰기 경로는 트랜잭션(tx)을 받아야 한다.
 */
export type Queryable = postgres.Sql | postgres.TransactionSql;
