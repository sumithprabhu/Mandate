export function truncateAddress(address: string, chars = 4): string {
  if (!address || address.length <= chars * 2 + 2) return address;
  return `${address.slice(0, chars + 2)}…${address.slice(-chars)}`;
}

/** ERC-8004 feedback `value` is a raw int with a client-chosen `valueDecimals` scale --
 * there's no fixed 0-100 or 0-5 range on-chain, so this only undoes the scaling, it
 * doesn't normalize to any particular rating system. */
export function scaleFeedbackValue(value: string, valueDecimals: number): number {
  return Number(value) / 10 ** valueDecimals;
}
