"use client";

import { useMemo, useState } from "react";

export function CostModel() {
  const [cvs, setCvs] = useState(1000);
  const [tokens, setTokens] = useState(5500);
  const [price, setPrice] = useState(0.002);
  const [hosting, setHosting] = useState(185);
  const [storage, setStorage] = useState(25);
  const [seats, setSeats] = useState(20);
  const output = useMemo(() => {
    const ai = cvs * (tokens / 1000) * price;
    const software = ai + hosting + storage + seats * 8;
    const manual = cvs * 0.75 * 38;
    return {
      ai,
      software,
      perCandidate: software / cvs,
      manual,
      saved: manual - software,
    };
  }, [cvs, tokens, price, hosting, storage, seats]);
  const fields = [
    ["CVs / month", cvs, setCvs, 1],
    ["Tokens / parse + match", tokens, setTokens, 100],
    ["Price / 1K tokens ($)", price, setPrice, 0.001],
    ["Hosting / month ($)", hosting, setHosting, 5],
    ["Storage / month ($)", storage, setStorage, 5],
    ["User seats", seats, setSeats, 1],
  ] as const;
  return (
    <div className="grid gap-5 p-5 xl:grid-cols-2">
      <div className="grid grid-cols-2 gap-3">
        {fields.map(([label, value, setter, step]) => (
          <label key={label} className="text-xs font-medium text-slate-600">
            {label}
            <input
              type="number"
              min={0}
              step={step}
              value={value}
              onChange={(event) => setter(Number(event.target.value))}
              className="mt-1 w-full"
            />
          </label>
        ))}
      </div>
      <div className="rounded-xl bg-slate-900 p-5 text-white">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Estimated monthly operating cost
        </div>
        <div className="mt-2 text-3xl font-semibold">${output.software.toFixed(2)}</div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-slate-400">Per candidate</div>
            <div className="font-semibold">${output.perCandidate.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-slate-400">AI processing</div>
            <div className="font-semibold">${output.ai.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-slate-400">Current manual process</div>
            <div className="font-semibold">${output.manual.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-slate-400">Modeled monthly savings</div>
            <div className="font-semibold text-emerald-400">${output.saved.toLocaleString()}</div>
          </div>
        </div>
        <p className="mt-4 text-[11px] leading-4 text-slate-400">
          Assumes 45 recruiter minutes per CV at $38/hour, $8 per seat, and the editable hosting, storage, and token rates shown.
        </p>
      </div>
    </div>
  );
}
