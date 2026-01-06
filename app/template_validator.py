import json
from jsonschema import validate, ValidationError, Draft7Validator
from typing import Tuple


def validate_json_against_schema(json_data: dict, json_schema: dict) -> Tuple[bool, str]:
    """
    Validate JSON data against a JSON Schema.

    Args:
        json_data: The JSON data to validate
        json_schema: The JSON Schema definition

    Returns:
        Tuple of (is_valid: bool, error_message: str)
    """
    try:
        # Validate the schema itself first
        Draft7Validator.check_schema(json_schema)

        # Validate the data against the schema
        validate(instance=json_data, schema=json_schema)
        return True, ""

    except ValidationError as e:
        # Return detailed validation error message
        error_path = " -> ".join(str(p) for p in e.path) if e.path else "root"
        return False, f"Validation error at {error_path}: {e.message}"

    except Exception as e:
        # Handle other errors (e.g., invalid schema)
        return False, f"Schema validation error: {str(e)}"


def parse_schema_from_text(schema_text: str) -> Tuple[dict, str]:
    """
    Parse JSON schema from text string.

    Args:
        schema_text: JSON schema as string

    Returns:
        Tuple of (schema: dict, error_message: str)
    """
    try:
        schema = json.loads(schema_text)
        if not isinstance(schema, dict):
            return {}, "Schema must be a JSON object"
        return schema, ""
    except json.JSONDecodeError as e:
        return {}, f"Invalid JSON: {str(e)}"
