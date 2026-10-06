<?php

// Mensajes de validación en español (reglas usadas por el sitio).
return [
    'confirmed' => 'La confirmación de :attribute no coincide.',
    'current_password' => 'La contraseña actual no es correcta.',
    'email' => 'Escriba un correo electrónico válido.',
    'in' => 'El valor de :attribute no es válido.',
    'integer' => ':Attribute debe ser un número entero.',
    'lowercase' => ':Attribute debe estar en minúsculas.',
    'max' => [
        'numeric' => ':Attribute no puede ser mayor que :max.',
        'string' => ':Attribute no puede superar :max caracteres.',
    ],
    'min' => [
        'numeric' => ':Attribute debe ser al menos :min.',
        'string' => ':Attribute debe tener al menos :min caracteres.',
    ],
    'password' => [
        'letters' => ':Attribute debe contener al menos una letra.',
        'mixed' => ':Attribute debe contener mayúsculas y minúsculas.',
        'numbers' => ':Attribute debe contener al menos un número.',
        'symbols' => ':Attribute debe contener al menos un símbolo.',
        'uncompromised' => 'Esta contraseña apareció en una filtración de datos. Elija otra.',
    ],
    'required' => ':Attribute es obligatorio.',
    'required_without' => 'Indique :attribute.',
    'string' => ':Attribute debe ser un texto.',
    'unique' => 'Ese :attribute ya está registrado.',

    'attributes' => [
        'name' => 'el nombre',
        'email' => 'correo',
        'password' => 'la contraseña',
        'current_password' => 'la contraseña actual',
        'jugador' => 'el jugador',
        'invitado' => 'el invitado',
    ],
];
