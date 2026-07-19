export function formatMoney(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
