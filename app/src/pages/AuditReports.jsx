// Audit reports (#/health/audits): the one full report of all audits, inside Health's place. The CHIP / Screen
// template plus its content; the breadcrumb reads CHIP › Health › Audit reports and its first part goes back to Health.
import Screen from '../templates/Screen.jsx';
import AuditReportsContent from './AuditReportsContent.jsx';

export default function AuditReports() {
  return (
    <Screen place="health" header={{ title: 'Audit reports', parent: 'Health', back: '#/health' }}>
      <AuditReportsContent />
    </Screen>
  );
}
