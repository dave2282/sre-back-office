import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Parses a combined address string into parts.
 * Expects: "123 Main St, Denver, CO 80201" or "123 Main St, Denver CO 80201"
 */
function parseAddress(str) {
  if (!str) return { street: "", city: "", state: "", zip: "" };
  // Try to extract zip (5 digits) at the end
  const zipMatch = str.match(/(\d{5}(?:-\d{4})?)[\s]*$/);
  const zip = zipMatch ? zipMatch[1] : "";
  const withoutZip = zip ? str.slice(0, str.lastIndexOf(zip)).trim().replace(/,?\s*$/, "") : str.trim();
  // Try to extract state (2 uppercase letters) before zip
  const stateMatch = withoutZip.match(/,?\s*([A-Z]{2})\s*$/);
  const state = stateMatch ? stateMatch[1] : "";
  const withoutState = state ? withoutZip.slice(0, withoutZip.lastIndexOf(stateMatch[0])).trim() : withoutZip;
  // Split remaining on last comma for city
  const lastComma = withoutState.lastIndexOf(",");
  if (lastComma !== -1) {
    return {
      street: withoutState.slice(0, lastComma).trim(),
      city: withoutState.slice(lastComma + 1).trim(),
      state,
      zip,
    };
  }
  return { street: withoutState, city: "", state, zip };
}

function combineAddress(street, city, state, zip) {
  const parts = [street, city].filter(Boolean);
  const cityStateZip = [city, state ? `${state}${zip ? " " + zip : ""}` : zip].filter(Boolean);
  if (!street && !city && !state && !zip) return "";
  // Format: "Street, City, ST Zip"
  const result = [street, [city, [state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ")].filter(Boolean).join(", ");
  return result;
}

export default function AddressInput({ value, onChange, label, required, className = "" }) {
  const [parts, setParts] = useState(() => parseAddress(value));

  useEffect(() => {
    // Only re-parse if the external value differs from what we'd produce from current parts.
    // This prevents the component from overwriting the user's edits when they type in sub-fields.
    const combined = combineAddress(parts.street, parts.city, parts.state, parts.zip);
    if (value !== combined) {
      setParts(parseAddress(value));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const update = (field, val) => {
    const next = { ...parts, [field]: val };
    setParts(next);
    onChange(combineAddress(next.street, next.city, next.state, next.zip));
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {label && (
        <Label className={required ? "after:content-['*'] after:text-red-500 after:ml-1" : ""}>
          {label}
        </Label>
      )}
      <Input
        placeholder="Street Address"
        value={parts.street}
        onChange={e => update("street", e.target.value)}
      />
      <div className="grid grid-cols-5 gap-2">
        <div className="col-span-3">
          <Input
            placeholder="City"
            value={parts.city}
            onChange={e => update("city", e.target.value)}
          />
        </div>
        <div>
          <Input
            placeholder="ST"
            maxLength={2}
            value={parts.state}
            onChange={e => update("state", e.target.value.toUpperCase())}
          />
        </div>
        <div>
          <Input
            placeholder="Zip"
            maxLength={10}
            value={parts.zip}
            onChange={e => update("zip", e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}