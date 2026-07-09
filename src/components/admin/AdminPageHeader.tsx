import React from 'react';

interface AdminPageHeaderProps {
  title: string;
  subtitle?: string;
  /** @deprecated back button removed from admin headers */
  backPath?: string;
  rightContent?: React.ReactNode;
}

export const AdminPageHeader = ({
  title,
  subtitle,
  rightContent,
}: AdminPageHeaderProps) => {
  return (
    <div className="flex items-center gap-4">
      <div className="flex-1">
        <h1 className="text-3xl font-bold text-foreground">{title}</h1>
        {subtitle && (
          <p className="text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {rightContent && (
        <div className="flex items-center gap-2">
          {rightContent}
        </div>
      )}
    </div>
  );
};
