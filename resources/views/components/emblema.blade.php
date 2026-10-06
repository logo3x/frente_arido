@props(['faccion'])
{{-- Emblemas originales de facción (los mismos de EMBLEM en public/juego/juego.js) --}}
@switch($faccion)
    @case('atlas')
        <svg {{ $attributes }} viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14" fill="none" stroke="#5fb4ff" stroke-width="2"/><path d="M6 19 L16 8 L26 19 L21 19 L16 13 L11 19 Z" fill="#5fb4ff"/><path d="M10 23 H22" stroke="#e6eef5" stroke-width="2"/></svg>
        @break
    @case('hierro')
        <svg {{ $attributes }} viewBox="0 0 32 32" aria-hidden="true"><path d="M11 3 H21 L29 11 V21 L21 29 H11 L3 21 V11 Z" fill="none" stroke="#ff7a45" stroke-width="2.4"/><rect x="8" y="13" width="16" height="6" fill="#ff7a45"/><rect x="13" y="8" width="6" height="16" fill="#f1e3d6"/></svg>
        @break
    @case('guerrilla')
        <svg {{ $attributes }} viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3 L19 12 L28 12 L21 18 L24 27 L16 21 L8 27 L11 18 L4 12 L13 12 Z" fill="none" stroke="#b8d057" stroke-width="2" stroke-linejoin="round"/><circle cx="16" cy="16" r="3.5" fill="#b8d057"/></svg>
        @break
    @default
        {{-- Insignia general del proyecto: cresta de duna sobre retícula --}}
        <svg {{ $attributes }} viewBox="0 0 32 32" aria-hidden="true"><rect x="3" y="3" width="26" height="26" fill="none" stroke="#e8a33d" stroke-width="2"/><path d="M3 21 C9 13 14 13 18 17 S25 20 29 14" fill="none" stroke="#e8a33d" stroke-width="2.4"/><path d="M16 3 V9 M16 23 V29 M3 16 H7 M25 16 H29" stroke="#ece5d1" stroke-width="1.6"/></svg>
@endswitch
