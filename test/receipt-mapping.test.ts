import { describe, expect, it } from "vitest";
import { receiptFromCardcom, type OrderRecord } from "../src/cardcom";
import { buildReceiptInput } from "../src/mcp";

// Shape of a Cardcom GetLpResult reply (from Cardcom's docs and our test charge on 2026-11-03).
const deal = (t: Record<string, unknown> = {}) => ({
  ResponseCode: 0,
  ReturnValue: "GC-1013",
  UIValues: { CardOwnerName: "Card Owner", CardOwnerEmail: "owner@example.com", CustomFields: [{ Id: 1, Value: "Dana" }, { Id: 2, Value: "Order GC-1013" }] },
  TranzactionInfo: {
    ResponseCode: 0, TranzactionId: 268828046, Amount: 120, Last4CardDigitsString: "0008", Brand: "Visa",
    NumberOfPayments: 1, FirstPaymentAmount: 0, ApprovalNumber: "0012345", CreateDate: "2026-11-03T13:39:20", ...t,
  },
});

const order: OrderRecord = { order_id: "GC-1013", amount: 120, customer_name: "Dana Levi", customer_email: "dana@example.com", description: "Order GC-1013: lawn" };

describe("receiptFromCardcom", () => {
  it("uses the store's order details and the charged amount", () => {
    const r = receiptFromCardcom(deal(), order);
    expect(r).toMatchObject({
      order_id: "GC-1013", customer_name: "Dana Levi", customer_email: "dana@example.com", amount: 120,
      payment_method: "credit_card", card_last_digits: "0008", card_type: "Visa", installments: 1,
      voucher_number: "0012345", description: "Order GC-1013: lawn", send_to_customer: true,
    });
    expect(r.first_installment).toBeUndefined();
  });

  it("charged amount wins over the order amount", () => {
    expect(receiptFromCardcom(deal({ Amount: 99.5 }), order).amount).toBe(99.5);
  });

  it("falls back to Cardcom's custom fields without an order record", () => {
    const r = receiptFromCardcom(deal(), null);
    expect(r.customer_name).toBe("Dana");
    expect(r.customer_email).toBe("owner@example.com");
    expect(r.description).toBe("Order GC-1013");
  });

  it("maps brands Cardcom and SmartBee spell differently, unknown to Other", () => {
    expect(receiptFromCardcom(deal({ Brand: "MasterCard" }), order).card_type).toBe("Mastercard");
    expect(receiptFromCardcom(deal({ Brand: "PrivateCard" }), order).card_type).toBe("Other");
  });

  it("carries installments and the first payment", () => {
    const r = receiptFromCardcom(deal({ NumberOfPayments: 3, FirstPaymentAmount: 50 }), order);
    expect(r.installments).toBe(3);
    expect(r.first_installment).toBe(50);
  });

  it("pads numeric last digits", () => {
    expect(receiptFromCardcom(deal({ Last4CardDigitsString: "", Last4CardDigits: 8 }), order).card_last_digits).toBe("0008");
  });

  it("Bit on Cardcom's page issues a Bit receipt, not a card receipt", () => {
    for (const v of [104, "104", 12, 14, "BitCardcom"]) {
      const r = receiptFromCardcom({ ...deal(), ExternalPaymentVector: v }, order);
      expect(r.payment_method).toBe("bit");
      expect(r.card_last_digits).toBeUndefined();
      expect(r.amount).toBe(120);
      expect(buildReceiptInput(r).receiptDetails!.otherItems![0].description).toBe("Bit");
    }
  });

  it("PayPal issues an 'other' receipt labelled PayPal", () => {
    const r = receiptFromCardcom({ ...deal(), ExternalPaymentVector: 10 }, order);
    expect(r.payment_method).toBe("other");
    expect(buildReceiptInput(r).receiptDetails!.otherItems![0].description).toBe("PayPal");
  });

  it("Apple Pay, Google Pay, 3DS and plain cards stay card receipts", () => {
    for (const v of [undefined, 0, "0", 11, 13, 15, "NoneOrUnknown"]) {
      expect(receiptFromCardcom({ ...deal(), ExternalPaymentVector: v }, order).payment_method).toBe("credit_card");
    }
  });
});

describe("buildReceiptInput credit card", () => {
  const base = { customer_name: "Dana", amount: 120, payment_method: "credit_card", card_last_digits: "4580280000000008", payment_date: "2026-11-03" };

  it("single payment: Regular, last 4 digits only", () => {
    const item = buildReceiptInput({ ...base, card_type: "Visa", voucher_number: "0012345" }).receiptDetails!.creditCardItems![0];
    expect(item).toMatchObject({ creditCardType: "Visa", cardNumber: "0008", creditDealType: "Regular", installmentsNumber: 1, voucherNumber: "0012345", sum: 120 });
  });

  it("installments: Installments type with first payment", () => {
    const item = buildReceiptInput({ ...base, installments: 3, first_installment: 50 }).receiptDetails!.creditCardItems![0];
    expect(item).toMatchObject({ creditDealType: "Installments", installmentsNumber: 3, firstInstallment: 50 });
  });

  it("unknown card type becomes Other; installments clamp to 1-99", () => {
    const a = buildReceiptInput({ ...base, card_type: "Discover", installments: 0 }).receiptDetails!.creditCardItems![0];
    expect(a).toMatchObject({ creditCardType: "Other", installmentsNumber: 1 });
    const b = buildReceiptInput({ ...base, installments: 500 }).receiptDetails!.creditCardItems![0];
    expect(b.installmentsNumber).toBe(99);
  });

  it("refuses a card receipt without last digits", () => {
    expect(() => buildReceiptInput({ ...base, card_last_digits: "" })).toThrow(/card_last_digits/);
  });
});
