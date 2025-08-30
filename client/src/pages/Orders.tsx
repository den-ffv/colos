import { Table } from 'antd'

type Order = { id: string; number: string; customer: string; createdAt: string };
const data: Order[] = [
  { id: '1', number: 'ORD-1001', customer: 'ТОВ Ромашка', createdAt: '2025-08-25' },
];


export default function Orders() {
  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Замовлення</h1>
      <Table rowKey="id" dataSource={data} columns={[
        { title: '№', dataIndex: 'number' },
        { title: 'Клієнт', dataIndex: 'customer' },
        { title: 'Створено', dataIndex: 'createdAt' },
        ]} />
    </div>
  )
}