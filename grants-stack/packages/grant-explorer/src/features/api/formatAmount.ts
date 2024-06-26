import { BigNumberish } from "ethers";
import { formatUnits } from "ethers/lib/utils.js";

export function formatAmount(
    _value: bigint | string,
    units: BigNumberish = 18,
    maximumSignificantDigits?: number | null
  ): string {
    // If _value is already in string form, assign to formattedValue
    // Otherwise, convert BigNumber (really large integers) to whole AOE balance (human readable floats)
    const formattedValue: string =
      typeof _value === "string"
        ? _value
        : formatUnits(_value as bigint, units).toString();
    let result: number = parseFloat(formattedValue);
    // If `maxDecimals` passed, fix/truncate to string and parse back to number
    result = parseFloat(result.toFixed(2));

    // If `maximumSignificantDigits` passed, return compact human-readable form to specified digits
    if (maximumSignificantDigits) {
      return new Intl.NumberFormat("en", {
        notation: "compact",
        maximumSignificantDigits,
      }).format(result);
    }

    try {
      // Else, return commified result
      return result.toLocaleString();
    } catch {
      // return result without comma if failed to add comma
      return result.toString();
    }
  }