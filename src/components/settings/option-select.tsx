import React from "react";

export const OptionSelect: React.FC<{
  options: readonly { label: string; value: string; disabled?: boolean }[];
  value: string;
  onChange: (v: string) => void;
}> = ({ options, value, onChange }) => {
  const isUnknown = options.find((o) => o.value === value) === undefined;
  const unknownValue = isUnknown && !!value ? [{ label: value, value }] : [];
  return (
    <>
      <select
        className="dropdown"
        value={value}
        onChange={(evt) => onChange(evt.target.value)}
      >
        {options.concat(unknownValue).map((option) => (
          <option
            key={option.value}
            value={option.value}
            disabled={option.disabled}
          >
            {option.label}
          </option>
        ))}
      </select>
    </>
  );
};
