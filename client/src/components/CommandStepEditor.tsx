import { type ReactElement } from "react";
import type { CommandStep } from "../types";
import { RemoveButton } from "./RemoveButton";

export function CommandStepEditor({
  steps,
  onChange,
  showPassBody
}: {
  steps: CommandStep[];
  onChange: (steps: CommandStep[]) => void;
  showPassBody: boolean;
}): ReactElement {
  function updateStep(index: number, field: keyof CommandStep, value: string | false): void {
    const next = [...steps];
    next[index] = { ...next[index], [field]: value };
    onChange(next);
  }

  return (
    <>
      <div className="settings-dir-list">
        {steps.map((step, index) => (
          <div key={index} className="command-step-row">
            <input
              value={step.command}
              onChange={(e) => updateStep(index, "command", e.target.value)}
              placeholder={`e.g. echo $TASK_TITLE`}
            />
            {showPassBody && index === 0 ? (
              <select
                value={step.passBody === false ? "false" : (step.passBody || "false")}
                onChange={(e) => {
                  const v = e.target.value;
                  updateStep(index, "passBody", v === "false" ? false : v);
                }}
                title="Pass task body"
              >
                <option value="false">No body</option>
                <option value="arg">Body as arg</option>
                <option value="stdin">Body as stdin</option>
              </select>
            ) : null}
            <RemoveButton onClick={() => onChange(steps.filter((_, i) => i !== index))} disabled={steps.length <= 1} />
          </div>
        ))}
      </div>
      <button type="button" className="ghost-button" onClick={() => onChange([...steps, { command: "" }])}>+ Add command</button>
    </>
  );
}
