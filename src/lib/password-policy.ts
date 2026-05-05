export function validatePassword(password: string) {
  if (password.length < 6) {
    return "La contraseña debe tener mínimo 6 caracteres.";
  }

  if (!/[A-ZÁÉÍÓÚÑ]/.test(password)) {
    return "La contraseña debe incluir al menos una mayúscula.";
  }

  return null;
}
