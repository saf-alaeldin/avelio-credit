import React, { useState } from 'react';
import { CheckCircle, AlertTriangle, PlusCircle, Globe, XCircle, FileSpreadsheet } from 'lucide-react';

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '20px',
  },
  modal: {
    background: '#fff',
    borderRadius: '16px',
    width: '100%',
    maxWidth: '800px',
    maxHeight: '85vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
  },
  header: {
    padding: '20px 24px',
    borderBottom: '1px solid #e5e7eb',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  title: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#111827',
    margin: 0,
  },
  fileName: {
    fontSize: '13px',
    color: '#6b7280',
    margin: '2px 0 0',
  },
  body: {
    padding: '20px 24px',
    overflowY: 'auto',
    flex: 1,
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
    gap: '12px',
    marginBottom: '20px',
  },
  summaryCard: {
    padding: '12px',
    borderRadius: '10px',
    textAlign: 'center',
  },
  summaryNumber: {
    fontSize: '24px',
    fontWeight: 700,
    lineHeight: 1.2,
  },
  summaryLabel: {
    fontSize: '12px',
    fontWeight: 600,
    marginTop: '4px',
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
  },
  section: {
    marginBottom: '16px',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
    fontSize: '14px',
    fontWeight: 700,
    color: '#374151',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
  },
  th: {
    textAlign: 'left',
    padding: '8px 10px',
    background: '#f9fafb',
    borderBottom: '1px solid #e5e7eb',
    fontWeight: 600,
    color: '#6b7280',
    fontSize: '11px',
    textTransform: 'uppercase',
  },
  td: {
    padding: '8px 10px',
    borderBottom: '1px solid #f3f4f6',
    color: '#111827',
  },
  badge: {
    display: 'inline-block',
    padding: '2px 7px',
    borderRadius: '6px',
    fontSize: '10px',
    fontWeight: 700,
    textTransform: 'uppercase',
  },
  footer: {
    padding: '16px 24px',
    borderTop: '1px solid #e5e7eb',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
  },
  btnCancel: {
    padding: '10px 20px',
    borderRadius: '10px',
    border: '1px solid #e5e7eb',
    background: '#fff',
    color: '#374151',
    fontWeight: 600,
    fontSize: '14px',
    cursor: 'pointer',
  },
  btnConfirm: {
    padding: '10px 24px',
    borderRadius: '10px',
    border: 'none',
    background: 'linear-gradient(135deg, #8B5CF6, #7C3AED)',
    color: '#fff',
    fontWeight: 600,
    fontSize: '14px',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(139,92,246,0.3)',
  },
  warningRow: {
    background: '#fffbeb',
  },
  agencyIdChange: {
    fontSize: '11px',
    color: '#d97706',
    display: 'block',
    marginTop: '2px',
  },
};

export default function ImportPreviewModal({ isOpen, data, loading, fileName, onConfirm, onClose }) {
  const [activeTab, setActiveTab] = useState('matched');

  if (!isOpen || !data) return null;

  const { summary, matched, newReceipts, ebbDeposits, warnings, errors } = data;
  const hasData = (matched?.length || 0) + (newReceipts?.length || 0) + (ebbDeposits?.length || 0) > 0;

  const tabs = [
    { key: 'matched', label: 'Matched', count: matched?.length || 0, color: '#059669' },
    { key: 'new', label: 'New Receipts', count: newReceipts?.length || 0, color: '#0ea5e9' },
    { key: 'ebb', label: 'EBB Deposits', count: ebbDeposits?.length || 0, color: '#6366f1' },
    { key: 'errors', label: 'Errors', count: errors?.length || 0, color: '#dc2626' },
  ];

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <FileSpreadsheet size={22} color="#8B5CF6" />
            <div>
              <h3 style={styles.title}>Import Preview</h3>
              {fileName && <p style={styles.fileName}>{fileName}</p>}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#9ca3af' }}>
            &times;
          </button>
        </div>

        {/* Body */}
        <div style={styles.body}>
          {/* Summary Cards */}
          <div style={styles.summaryGrid}>
            <div style={{ ...styles.summaryCard, background: '#ecfdf5', border: '1px solid #a7f3d0' }}>
              <div style={{ ...styles.summaryNumber, color: '#059669' }}>{summary?.matched || 0}</div>
              <div style={{ ...styles.summaryLabel, color: '#065f46' }}>Matched</div>
            </div>
            <div style={{ ...styles.summaryCard, background: '#f0f9ff', border: '1px solid #bae6fd' }}>
              <div style={{ ...styles.summaryNumber, color: '#0284c7' }}>{summary?.newReceipts || 0}</div>
              <div style={{ ...styles.summaryLabel, color: '#075985' }}>New</div>
            </div>
            <div style={{ ...styles.summaryCard, background: '#eef2ff', border: '1px solid #c7d2fe' }}>
              <div style={{ ...styles.summaryNumber, color: '#4f46e5' }}>{summary?.ebbDeposits || 0}</div>
              <div style={{ ...styles.summaryLabel, color: '#3730a3' }}>EBB</div>
            </div>
            {(summary?.warnings || 0) > 0 && (
              <div style={{ ...styles.summaryCard, background: '#fffbeb', border: '1px solid #fde68a' }}>
                <div style={{ ...styles.summaryNumber, color: '#d97706' }}>{summary.warnings}</div>
                <div style={{ ...styles.summaryLabel, color: '#92400e' }}>Warnings</div>
              </div>
            )}
            {(summary?.errors || 0) > 0 && (
              <div style={{ ...styles.summaryCard, background: '#fef2f2', border: '1px solid #fecaca' }}>
                <div style={{ ...styles.summaryNumber, color: '#dc2626' }}>{summary.errors}</div>
                <div style={{ ...styles.summaryLabel, color: '#991b1b' }}>Errors</div>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', background: '#f1f5f9', padding: '4px', borderRadius: '10px' }}>
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: '7px 14px',
                  borderRadius: '8px',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: activeTab === tab.key ? '#fff' : 'transparent',
                  color: activeTab === tab.key ? tab.color : '#64748b',
                  boxShadow: activeTab === tab.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  transition: 'all 0.15s',
                }}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>

          {/* Matched Tab */}
          {activeTab === 'matched' && (
            <div style={styles.section}>
              {/* Amount Mismatches Summary */}
              {(() => {
                const mismatches = (matched || []).filter(m => m.amountMismatch);
                if (mismatches.length === 0) return null;
                const totalDiff = mismatches.reduce((sum, m) => sum + (m.excelAmount - m.dbAmount), 0);
                return (
                  <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '12px 16px', marginBottom: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <AlertTriangle size={16} color="#d97706" />
                      <span style={{ fontWeight: 700, color: '#92400e', fontSize: '14px' }}>
                        {mismatches.length} Amount Mismatch{mismatches.length > 1 ? 'es' : ''} (Net: {totalDiff >= 0 ? '+' : ''}{totalDiff.toFixed(2)} USD)
                      </span>
                    </div>
                    <table style={{ ...styles.table, fontSize: '12px' }}>
                      <thead>
                        <tr>
                          <th style={{ ...styles.th, background: '#fef3c7' }}>Receipt #</th>
                          <th style={{ ...styles.th, background: '#fef3c7' }}>DB Agency</th>
                          <th style={{ ...styles.th, background: '#fef3c7' }}>Excel Customer</th>
                          <th style={{ ...styles.th, background: '#fef3c7' }}>DB Amount</th>
                          <th style={{ ...styles.th, background: '#fef3c7' }}></th>
                          <th style={{ ...styles.th, background: '#fef3c7' }}>Excel Amount</th>
                          <th style={{ ...styles.th, background: '#fef3c7' }}>Diff</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mismatches.map((item, i) => {
                          const diff = item.excelAmount - item.dbAmount;
                          return (
                            <tr key={i} style={{ background: '#fffbeb' }}>
                              <td style={{ ...styles.td, fontWeight: 600 }}>{item.receiptNumber}</td>
                              <td style={styles.td}>{item.dbAgencyName}</td>
                              <td style={styles.td}>{item.excelCustomer}</td>
                              <td style={{ ...styles.td, color: '#dc2626', textDecoration: 'line-through' }}>{item.dbAmount}</td>
                              <td style={{ ...styles.td, textAlign: 'center', fontWeight: 700 }}>→</td>
                              <td style={{ ...styles.td, color: '#059669', fontWeight: 700 }}>{item.excelAmount}</td>
                              <td style={{ ...styles.td, color: diff > 0 ? '#059669' : '#dc2626', fontWeight: 600 }}>
                                {diff > 0 ? '+' : ''}{diff.toFixed(2)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}

              {matched?.length > 0 ? (
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Receipt #</th>
                      <th style={styles.th}>Agency</th>
                      <th style={styles.th}>Amount</th>
                      <th style={styles.th}>Status</th>
                      <th style={styles.th}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matched.map((item, i) => (
                      <tr key={i} style={item.amountMismatch ? styles.warningRow : {}}>
                        <td style={styles.td}>{item.receiptNumber}</td>
                        <td style={styles.td}>
                          {item.dbAgencyName}
                          {item.agencyIdMismatch && (
                            <span style={styles.agencyIdChange}>
                              ID: {item.dbAgencyId} → {item.newAgencyId}
                            </span>
                          )}
                        </td>
                        <td style={styles.td}>
                          {item.amountMismatch ? (
                            <>
                              <span style={{ textDecoration: 'line-through', color: '#dc2626' }}>{item.dbAmount}</span>
                              <span style={{ color: '#059669', fontWeight: 700, marginLeft: '6px' }}>→ {item.excelAmount}</span>
                              <span style={{ marginLeft: '4px' }}>{item.excelCurrency}</span>
                            </>
                          ) : (
                            <>{item.dbAmount} {item.dbCurrency}</>
                          )}
                        </td>
                        <td style={styles.td}>
                          <span style={{
                            ...styles.badge,
                            background: item.dbStatus === 'PAID' ? '#ecfdf5' : '#fffbeb',
                            color: item.dbStatus === 'PAID' ? '#047857' : '#92400e',
                          }}>
                            {item.dbStatus}
                          </span>
                        </td>
                        <td style={styles.td}>
                          {item.amountMismatch && (
                            <span style={{ ...styles.badge, background: '#fef3c7', color: '#92400e', marginRight: '4px' }}>Fix amount</span>
                          )}
                          {item.alreadyDeposited ? (
                            <span style={{ ...styles.badge, background: '#f3f4f6', color: '#6b7280' }}>Already deposited</span>
                          ) : (
                            <span style={{ ...styles.badge, background: '#d1fae5', color: '#065f46' }}>Mark deposited</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={{ color: '#6b7280', textAlign: 'center', padding: '20px' }}>No matched receipts</p>
              )}
            </div>
          )}

          {/* New Receipts Tab */}
          {activeTab === 'new' && (
            <div style={styles.section}>
              {newReceipts?.length > 0 ? (
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Excel Customer</th>
                      <th style={styles.th}>Matched Agency</th>
                      <th style={styles.th}>Amount</th>
                      <th style={styles.th}>Date</th>
                      <th style={styles.th}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {newReceipts.map((item, i) => (
                      <tr key={i} style={item.type === 'credit_reversal_new' ? { background: '#fef2f2' } : {}}>
                        <td style={styles.td}>{item.excelCustomer}</td>
                        <td style={styles.td}>{item.matchedAgencyName} ({item.matchedAgencyId})</td>
                        <td style={{ ...styles.td, color: item.amount < 0 ? '#dc2626' : undefined, fontWeight: item.amount < 0 ? 700 : undefined }}>
                          {item.amount} {item.currency}
                        </td>
                        <td style={styles.td}>{item.dateStr}</td>
                        <td style={styles.td}>
                          {item.type === 'credit_reversal_new' ? (
                            <span style={{ ...styles.badge, background: '#fef2f2', color: '#dc2626' }}>Create VOID (reversal)</span>
                          ) : (
                            <span style={{ ...styles.badge, background: '#f0f9ff', color: '#0284c7' }}>Create {item.status || 'PENDING'}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={{ color: '#6b7280', textAlign: 'center', padding: '20px' }}>No new receipts to create</p>
              )}
            </div>
          )}

          {/* EBB Tab */}
          {activeTab === 'ebb' && (
            <div style={styles.section}>
              {ebbDeposits?.length > 0 ? (
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Excel Customer</th>
                      <th style={styles.th}>Matched Agency</th>
                      <th style={styles.th}>Amount</th>
                      <th style={styles.th}>Date</th>
                      <th style={styles.th}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ebbDeposits.map((item, i) => (
                      <tr key={i}>
                        <td style={styles.td}>
                          {item.excelCustomer}
                          <span style={{ display: 'block', fontSize: '11px', color: '#6366f1' }}>
                            Stripped: {item.agencyNameStripped}
                          </span>
                        </td>
                        <td style={styles.td}>{item.matchedAgencyName} ({item.matchedAgencyId})</td>
                        <td style={styles.td}>{item.amount} {item.currency}</td>
                        <td style={styles.td}>{item.dateStr}</td>
                        <td style={styles.td}>
                          <span style={{ ...styles.badge, background: '#eef2ff', color: '#4f46e5' }}>Create PAID (EBB)</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={{ color: '#6b7280', textAlign: 'center', padding: '20px' }}>No EBB deposits found</p>
              )}
            </div>
          )}

          {/* Errors Tab */}
          {activeTab === 'errors' && (
            <div style={styles.section}>
              {errors?.length > 0 ? (
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Row</th>
                      <th style={styles.th}>Customer</th>
                      <th style={styles.th}>Amount</th>
                      <th style={styles.th}>Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {errors.map((item, i) => (
                      <tr key={i} style={{ background: '#fef2f2' }}>
                        <td style={styles.td}>{item.rowIndex}</td>
                        <td style={styles.td}>{item.customer} ({item.customerId})</td>
                        <td style={styles.td}>{item.amount} {item.currency}</td>
                        <td style={styles.td} style={{ ...styles.td, color: '#dc2626', fontSize: '12px' }}>{item.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={{ color: '#059669', textAlign: 'center', padding: '20px' }}>No errors - all entries matched successfully</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <button style={styles.btnCancel} onClick={onClose}>Cancel</button>
          <button
            style={{
              ...styles.btnConfirm,
              opacity: !hasData || loading ? 0.6 : 1,
              cursor: !hasData || loading ? 'not-allowed' : 'pointer',
            }}
            onClick={onConfirm}
            disabled={!hasData || loading}
          >
            {loading ? 'Importing...' : `Confirm Import (${(summary?.matched || 0) + (summary?.newReceipts || 0) + (summary?.ebbDeposits || 0)} entries)`}
          </button>
        </div>
      </div>
    </div>
  );
}
