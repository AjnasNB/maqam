export class AjnasFrameworkError extends Error {
  constructor(message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.code = options.code || "AJNAS_FRAMEWORK_ERROR";
    this.details = options.details || {};
  }
}

export class PolicyDeniedError extends AjnasFrameworkError {
  constructor(message, options = {}) {
    super(message, {
      ...options,
      code: options.code || "POLICY_DENIED"
    });
  }
}

export class ApprovalRequiredError extends AjnasFrameworkError {
  constructor(message, options = {}) {
    super(message, {
      ...options,
      code: options.code || "APPROVAL_REQUIRED"
    });
  }
}

export function toErrorRecord(error) {
  return {
    name: error?.name || "Error",
    code: error?.code || "ERROR",
    message: error?.message || String(error),
    details: error?.details || {}
  };
}
