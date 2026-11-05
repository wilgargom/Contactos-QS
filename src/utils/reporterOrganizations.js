const ORGANIZATIONS = Object.freeze(['TEC', 'FUNDATEC', 'DOCINADE']);

function normalizeOrganization(value, fallback = 'TEC') {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return ORGANIZATIONS.includes(normalized) ? normalized : fallback;
}

function isValidOrganization(value) {
  return typeof value === 'string' && ORGANIZATIONS.includes(value.trim().toUpperCase());
}

function validReporterEmail(email, organization) {
  const normalized = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const generic = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
  if (!generic.test(normalized)) return false;
  return normalizeOrganization(organization) !== 'TEC' || /@(itcr\.ac\.cr|tec\.ac\.cr)$/.test(normalized);
}

module.exports = { ORGANIZATIONS, normalizeOrganization, isValidOrganization, validReporterEmail };
