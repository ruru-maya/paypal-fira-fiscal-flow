/** Pure decision: may this caller use the public test shop for this merchant? */
export const SHOP_PAUSED_MESSAGE = "This test shop is paused while the merchant is in Live mode.";
export function canUseTestShop(merchant: { demo_mode: boolean; user_id: string }, callerUserId: string | null): boolean {
  if (merchant.demo_mode) return true;
  return callerUserId !== null && callerUserId === merchant.user_id;
}
