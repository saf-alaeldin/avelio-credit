import React from 'react';
import './Skeleton.css';

export const Skeleton = ({ width, height, borderRadius = '8px', className = '' }) => {
  return (
    <div
      className={`skeleton ${className}`}
      style={{
        width: width || '100%',
        height: height || '20px',
        borderRadius
      }}
    />
  );
};

export const SkeletonCard = () => {
  return (
    <div className="skeleton-card">
      <Skeleton height="24px" width="60%" />
      <Skeleton height="16px" width="40%" style={{ marginTop: '12px' }} />
      <Skeleton height="16px" width="80%" style={{ marginTop: '8px' }} />
    </div>
  );
};

export const SkeletonTable = ({ rows = 5, columns = 4 }) => {
  return (
    <div className="skeleton-table">
      <div className="skeleton-table-header">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} height="20px" width={`${60 + Math.random() * 30}%`} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="skeleton-table-row">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton key={colIndex} height="16px" width={`${50 + Math.random() * 40}%`} />
          ))}
        </div>
      ))}
    </div>
  );
};

export const SkeletonDashboardCard = () => {
  return (
    <div className="skeleton-dashboard-card">
      <div className="skeleton-dashboard-card-header">
        <Skeleton width="40px" height="40px" borderRadius="10px" />
        <div style={{ flex: 1 }}>
          <Skeleton height="16px" width="60%" />
          <Skeleton height="12px" width="40%" style={{ marginTop: '6px' }} />
        </div>
      </div>
      <Skeleton height="32px" width="50%" style={{ marginTop: '16px' }} />
      <Skeleton height="12px" width="70%" style={{ marginTop: '8px' }} />
    </div>
  );
};

export const SkeletonReceipt = () => {
  return (
    <div className="skeleton-receipt">
      <Skeleton height="20px" width="150px" style={{ marginBottom: '20px' }} />
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="skeleton-receipt-row">
          <Skeleton height="16px" width="100px" />
          <Skeleton height="16px" width="150px" />
        </div>
      ))}
      <div style={{ marginTop: '24px', borderTop: '1px solid #E2E8F0', paddingTop: '24px' }}>
        <Skeleton height="120px" width="120px" borderRadius="12px" style={{ margin: '0 auto' }} />
      </div>
    </div>
  );
};

export default Skeleton;
