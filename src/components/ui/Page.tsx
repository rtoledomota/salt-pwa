import React from "react";

export function Page({
  title,
  description,
  right,
  children,
}: {
  title: string;
  description?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          {description ? <p className="text-gray-600 mt-1">{description}</p> : null}
        </div>
        {right ? <div className="flex items-center gap-2">{right}</div> : null}
      </div>

      {children}
    </div>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`bg-white rounded-lg border ${className}`}>{children}</div>;
}

export function CardBody({ children }: { children: React.ReactNode }) {
  return <div className="p-4">{children}</div>;
}

export function Alert({
  variant = "default",
  children,
}: {
  variant?: "default" | "error" | "success" | "warning";
  children: React.ReactNode;
}) {
  const styles =
    variant === "error"
      ? "bg-red-50 border-red-200 text-red-800"
      : variant === "success"
      ? "bg-green-50 border-green-200 text-green-800"
      : variant === "warning"
      ? "bg-yellow-50 border-yellow-200 text-yellow-800"
      : "bg-gray-50 border-gray-200 text-gray-800";

  return (
    <div className={`border rounded-lg p-4 ${styles}`}>
      <div className="text-sm">{children}</div>
    </div>
  );
}

export function Button({
  children,
  variant = "primary",
  disabled,
  onClick,
  type = "button",
  className = "",
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger" | "success";
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
  className?: string;
}) {
  const base =
    "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";

  const style =
    variant === "primary"
      ? "bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500"
      : variant === "success"
      ? "bg-green-600 text-white hover:bg-green-700 focus:ring-green-500"
      : variant === "danger"
      ? "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500"
      : "bg-white border text-gray-700 hover:bg-gray-50 focus:ring-gray-400";

  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${style} ${className}`}>
      {children}
    </button>
  );
}

export function Input({
  value,
  onChange,
  placeholder,
  className = "",
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${className}`}
    />
  );
}

export function Select({
  value,
  onChange,
  children,
  disabled,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={`border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${className}`}
    >
      {children}
    </select>
  );
}