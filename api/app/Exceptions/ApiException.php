<?php

namespace App\Exceptions;

use Illuminate\Http\JsonResponse;
use RuntimeException;

/**
 * A domain error rendered as the API error envelope:
 * { "error": { "code", "message", "details"? } }.
 */
class ApiException extends RuntimeException
{
    /** The envelope code, e.g. TRADING_PAUSED. (Exception::$code is an int.) */
    public readonly string $errorCode;

    /**
     * @param  array<string, mixed>  $details
     */
    public function __construct(
        string $code,
        string $message,
        public readonly int $status = 400,
        public readonly array $details = [],
    ) {
        parent::__construct($message);

        $this->errorCode = $code;
    }

    public function render(): JsonResponse
    {
        $body = ['error' => ['code' => $this->errorCode, 'message' => $this->getMessage()]];

        if ($this->details !== []) {
            $body['error']['details'] = $this->details;
        }

        return response()->json($body, $this->status);
    }
}
