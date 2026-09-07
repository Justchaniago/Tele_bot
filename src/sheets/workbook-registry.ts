import type { StoreId } from "../core/identifiers.js";

export type WorkbookRegistryEntry = {
  readonly productionWaste: string;
  readonly dailySo: string;
};

export const WORKBOOKS: Readonly<Record<StoreId, WorkbookRegistryEntry>> = Object.freeze({
  PMS: Object.freeze({
    productionWaste: "1j6cMyq3xlKN97TcfrgMBvJdJ8iZciPk_dR12LlXCJ5Q",
    dailySo: "1iU5sRZFyrPgjvvAaNnUOqWYbku0wP4Xj7sdu6sldnGk"
  }),
  TP6: Object.freeze({
    productionWaste: "1CzNeGZ_Ghb_Hng9CCk43TrdPOPjvcPqdyNK0CGpLkQU",
    dailySo: "1xq89wSaR_Tvoje1hhSc1ATwvJFx_PiZnU59Zk976oGY"
  })
});

export const PRODUCTION_WASTE_SHEET_NAME_PATTERN = "pre-resolved-by-M3";
