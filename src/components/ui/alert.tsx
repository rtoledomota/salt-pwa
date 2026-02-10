import * as React from "react";

type AlertVariant = "default" | "success" | "warning" | "error" | "info";

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant;
}

function variantClasses(variant: AlertVariant) {
  switch (variant) {
    case "success":
      return "border-green-200 bg-green-50 text-green-800";
    case "warning":
      return "border-yellow-200 bg-yellow-50 text-yellow-900";
    case "error":
      return "border-red-200 bg-red-50 text-red-900";
    case "info":
      return "border-blue-200 bg-blue-50 text-blue-900";
    default:
      return "border-slate-200 bg-white text-slate-900";
  }
}

export function Alert({
  variant = "default",
  className = "",
  ...props
}: AlertProps) {
  return (
    <div
      role="alert"
      className={[
        "w-full rounded-lg border px-4 py-3 text-sm",
        variantClasses(variant),
        className,
      ].join(" ")}
      {...props}
    />
  );
}

export interface AlertTitleProps
  extends React.HTMLAttributes<HTMLHeadingElement> {}

export function AlertTitle({ className = "", ...props }: AlertTitleProps) {
  return (
    <h5
      className={["mb-1 font-medium leading-none tracking-tight", className].join(
        " "
      )}
      {...props}
    />
  );
}

export interface AlertDescriptionProps
  extends React.HTMLAttributes<HTMLParagraphElement> {}

export function AlertDescription({
  className = "",
  ...props
}: AlertDescriptionProps) {
  return (
    <div className={["text-sm opacity-90", className].join(" ")}>
      <p {...props} />
    </div>
  );
}