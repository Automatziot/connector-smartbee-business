import { describe, expect, it } from "vitest";
import { buildReceiptInput } from "../src/mcp";

describe("buildReceiptInput", () => {
  const base = { customer_name: "Dana", amount: 120, payment_method: "credit_card", card_last_digits: "4580280000000008", payment_date: "2026-11-03" };

  it("credit card: Regular for one payment, last 4 digits only", () => {
    const item = buildReceiptInput({ ...base, card_type: "Visa", voucher_number: "0012345" }).receiptDetails!.creditCardItems![0];
    expect(item).toMatchObject({ creditCardType: "Visa", cardNumber: "0008", creditDealType: "Regular", installmentsNumber: 1, sum: 120 });
  });

  it("credit card: installments are clamped and an unknown brand becomes Other", () => {
    const item = buildReceiptInput({ ...base, card_type: "Discover", installments: 500 }).receiptDetails!.creditCardItems![0];
    expect(item.creditCardType).toBe("Other");
    expect(item.installmentsNumber).toBe(99);
  });

  it("Bit and PayPal are 'other' items with their own label", () => {
    expect(buildReceiptInput({ ...base, payment_method: "bit" }).receiptDetails!.otherItems![0].description).toBe("Bit");
    expect(buildReceiptInput({ ...base, payment_method: "other", payment_label: "PayPal" }).receiptDetails!.otherItems![0].description).toBe("PayPal");
  });

  it("missing card digits are refused", () => {
    expect(() => buildReceiptInput({ ...base, card_last_digits: "" })).toThrow(/card_last_digits/);
  });
});
