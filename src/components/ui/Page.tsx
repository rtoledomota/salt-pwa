import * as React from "react";
import { Slot } from "@radix-ui/react-slot";

// Reexport Alert from alert.tsx
export { Alert, AlertTitle, AlertDescription } from "./alert";

type ButtonVariant = "primary" | "secondary" | "danger" | "success";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  asChild?: boolean;
};

export function Button({
  variant = "primary",
  asChild = false,
  className = "",
  ...props
}: ButtonProps) {
  const Comp: any = asChild ? Slot : "button";

  const base =
    "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

  const variants: Record<ButtonVariant, string> = {
    primary: "bg-blue-600 text-white hover:bg-blue-700",
    secondary: "bg-gray-100 text-gray-900 hover:bg-gray-200 border border-gray-300",
    danger: "bg-red-600 text-white hover:bg-red-700",
    success: "bg-green-600 text-white hover:bg-green-700",
  };

  return (
    <Comp className={`${base} ${variants[variant]} ${className}`} {...props} />
  );
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export function Input({ className = "", ...props }: InputProps) {
  return (
    <input
      className={`border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${className}`}
      {...props}
    />
  );
}

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export function Select({ className = "", children, ...props }: SelectProps) {
  return (
    <select
      className={`border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

type PageProps = {
  title?: string;
  description?: string;
  children: React.ReactNode;
  right?: React.ReactNode;
};

export function Page({ title, description, children, right }: PageProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {(title || description || right) && (
          <div className="flex items-center justify-between mb-8">
            <div>
              {title && <h1 className="text-3xl font-bold text-gray-900">{title}</h1>}
              {description && <p className="mt-2 text-gray-600">{description}</p>}
            </div>
            {right && <div>{right}</div>}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

type CardProps = {
  children: React.ReactNode;
  className?: string;
};

export function Card({ children, className = "" }: CardProps) {
  return (
    <div className={`bg-white rounded-lg border border-gray-200 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

type CardBodyProps = {
  children: React.ReactNode;
  className?: string;
};

export function CardBody({ children, className = "" }: CardBodyProps) {
  return <div className={`p-6 ${className}`}>{children}</div>;
}