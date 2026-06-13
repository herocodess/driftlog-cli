import { listOrders } from '../db/orders'

export function Cart(): string[] {
  return listOrders()
}
