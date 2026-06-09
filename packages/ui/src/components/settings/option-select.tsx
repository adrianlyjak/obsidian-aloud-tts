import React from "react";

export interface SelectOption {
  label: string;
  value: string;
  disabled?: boolean;
}

export interface SelectGroup {
  label: string;
  options: SelectOption[];
}

export const OptionSelect: React.FC<{
  options?: readonly SelectOption[];
  groups?: readonly SelectGroup[];
  value: string;
  onChange: (v: string) => void;
}> = ({ options, groups, value, onChange }) => {
  const allOptions = groups
    ? groups.flatMap((g) => g.options)
    : (options ?? []);
  const isUnknown = allOptions.find((o) => o.value === value) === undefined;
  const unknownOption = isUnknown && !!value ? { label: value, value } : null;

  const renderOption = (option: SelectOption) => (
    <option key={option.value} value={option.value} disabled={option.disabled}>
      {option.label}
    </option>
  );

  return (
    <select
      className="dropdown"
      value={value}
      onChange={(evt) => onChange(evt.target.value)}
    >
      {unknownOption && renderOption(unknownOption)}
      {groups
        ? groups.flatMap((group) => [
            <option
              key={`__group__${group.label}`}
              disabled
              value={`__group__${group.label}`}
            >
              {`── ${group.label} ──`}
            </option>,
            ...group.options.map(renderOption),
          ])
        : allOptions.map(renderOption)}
    </select>
  );
};
