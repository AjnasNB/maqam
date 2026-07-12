export class AjnasFrameworkError extends Error {
  constructor(message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.code = options.code || "AJNAS_FRAMEWORK_ERROR";
    this.details = options.details || {};
  }
}

export class MaqamError extends AjnasFrameworkError {
  constructor(message, options = {}) {
    super(message, {
      ...options,
      code: options.code || "MAQAM_ERROR"
    });
  }
}

export class PolicyDeniedError extends MaqamError {
  constructor(message, options = {}) {
    super(message, {
      ...options,
      code: options.code || "POLICY_DENIED"
    });
  }
}

export class ApprovalRequiredError extends MaqamError {
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
