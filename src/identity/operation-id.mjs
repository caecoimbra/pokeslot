// UUIDv7: 48 bits de tempo e bits aleatórios de um UUID gerado pelo runtime.
export function createOperationId(now = Date.now()) {
  const timestamp = now.toString(16).padStart(12, '0');
  const random = crypto.randomUUID();
  return `${timestamp.slice(0, 8)}-${timestamp.slice(8)}-7${random.slice(15)}`;
}
