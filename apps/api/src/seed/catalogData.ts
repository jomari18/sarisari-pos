// The demo store's suki (spec 7.5); its products live in @sari/shared (demoCatalog).

/** Twelve suki. A limit of 0 means no utang. Phone numbers use the unassigned 0900 prefix. */
export const SUKI: { name: string; phone: string | null; creditLimitCentavos: number }[] = [
  { name: "Aling Rosa", phone: "09000000101", creditLimitCentavos: 50000 },
  { name: "Kuya Jun", phone: null, creditLimitCentavos: 0 },
  { name: "Ate Liza", phone: "09000000103", creditLimitCentavos: 100000 },
  { name: "Mang Tonyo", phone: null, creditLimitCentavos: 30000 },
  { name: "Aling Cora", phone: "09000000105", creditLimitCentavos: 0 },
  { name: "Kuya Dodong", phone: null, creditLimitCentavos: 150000 },
  { name: "Ate Joy", phone: "09000000107", creditLimitCentavos: 50000 },
  { name: "Mang Pido", phone: null, creditLimitCentavos: 20000 },
  { name: "Aling Bebang", phone: "09000000109", creditLimitCentavos: 0 },
  { name: "Kuya Ramil", phone: null, creditLimitCentavos: 100000 },
  { name: "Ate Mila", phone: "09000000111", creditLimitCentavos: 30000 },
  { name: "Lola Ising", phone: null, creditLimitCentavos: 50000 },
];
