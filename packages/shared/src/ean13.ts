// EAN-13 encoding tables (GS1). L and G encode the left half; R the right half.
const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
// The first digit is not drawn; it picks which left-half digits use G instead of L.
const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

export function ean13CheckDigit(first12: string): number {
  if (!/^\d{12}$/.test(first12)) throw new RangeError("An EAN-13 check digit needs exactly 12 digits.");
  const sum = [...first12].reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10;
}

export function isValidEan13(code: string): boolean {
  return /^\d{13}$/.test(code) && ean13CheckDigit(code.slice(0, 12)) === Number(code[12]);
}

/** The 95 modules of the barcode, "1" for a bar and "0" for a space, guards included. */
export function ean13Modules(code: string): string {
  if (!isValidEan13(code)) throw new RangeError(`Not a valid EAN-13 code: ${code}`);
  const digits = [...code].map(Number);
  const parity = PARITY[digits[0]!]!;
  const left = digits.slice(1, 7).map((digit, index) => (parity[index] === "L" ? L : G)[digit]!);
  const right = digits.slice(7).map((digit) => R[digit]!);
  return "101" + left.join("") + "01010" + right.join("") + "101";
}
