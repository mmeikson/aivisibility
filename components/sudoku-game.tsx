'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { getSudoku } from 'sudoku-gen'

function newGame() {
  const { puzzle, solution } = getSudoku('easy')
  return { puzzle, solution }
}

export default function SudokuGame() {
  const [{ puzzle, solution }, setGame] = useState(newGame)
  const [inputs, setInputs] = useState<Record<number, string>>({})
  const [selected, setSelected] = useState<number | null>(null)

  // sudoku-gen uses '-' for empty cells
  const given = useMemo(
    () => new Set(puzzle.split('').flatMap((c, i) => c !== '-' ? [i] : [])),
    [puzzle]
  )
  const errors = new Set(
    Object.entries(inputs).flatMap(([i, v]) => v && v !== solution[Number(i)] ? [Number(i)] : [])
  )
  const filled = given.size + Object.values(inputs).filter(Boolean).length
  const solved = filled === 81 && errors.size === 0

  // Use window-level keydown so keyboard works regardless of focus state
  const selectedRef = useRef(selected)
  selectedRef.current = selected
  const givenRef = useRef(given)
  givenRef.current = given

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const sel = selectedRef.current
      if (sel === null) return
      if (e.key >= '1' && e.key <= '9') {
        e.preventDefault()
        if (givenRef.current.has(sel)) return
        setInputs(prev => ({ ...prev, [sel]: e.key }))
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault()
        if (givenRef.current.has(sel)) return
        setInputs(prev => { const next = { ...prev }; delete next[sel]; return next })
      } else if (e.key === 'ArrowRight') { e.preventDefault(); setSelected(s => s !== null ? Math.min(80, s + 1) : 0) }
      else if (e.key === 'ArrowLeft')  { e.preventDefault(); setSelected(s => s !== null ? Math.max(0, s - 1) : 0) }
      else if (e.key === 'ArrowDown')  { e.preventDefault(); setSelected(s => s !== null ? Math.min(80, s + 9) : 0) }
      else if (e.key === 'ArrowUp')    { e.preventDefault(); setSelected(s => s !== null ? Math.max(0, s - 9) : 0) }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  function reset() {
    setGame(newGame())
    setInputs({})
    setSelected(null)
  }

  return (
    <div className="space-y-3">
      <div
        className="grid"
        style={{ gridTemplateColumns: 'repeat(9, 32px)', width: 'fit-content' }}
      >
        {Array.from({ length: 81 }, (_, i) => {
          const row = Math.floor(i / 9)
          const col = i % 9
          const isGiven = given.has(i)
          const value = isGiven ? puzzle[i] : (inputs[i] ?? '')
          const isSelected = selected === i
          const isError = errors.has(i)
          const isSameBox =
            selected !== null &&
            Math.floor(Math.floor(selected / 9) / 3) === Math.floor(row / 3) &&
            Math.floor((selected % 9) / 3) === Math.floor(col / 3)

          const borderRight  = col === 8 ? '1px solid #E5E2DC' : col % 3 === 2 ? '2px solid #CDCBC6' : '1px solid #E5E2DC'
          const borderBottom = row === 8 ? '1px solid #E5E2DC' : row % 3 === 2 ? '2px solid #CDCBC6' : '1px solid #E5E2DC'
          const borderLeft   = col === 0 ? '1px solid #E5E2DC' : undefined
          const borderTop    = row === 0 ? '1px solid #E5E2DC' : undefined

          return (
            <button
              key={i}
              type="button"
              onClick={() => setSelected(i)}
              style={{
                width: 32, height: 32,
                borderRight, borderBottom, borderLeft, borderTop,
                background: isSelected ? '#F0EFEC' : isSameBox && !isGiven ? '#F9F8F6' : isGiven ? '#F9F8F6' : 'white',
                outline: isSelected ? '2px solid #141414' : 'none',
                outlineOffset: '-2px',
                zIndex: isSelected ? 1 : 0,
                position: 'relative',
              }}
              className="flex items-center justify-center text-sm font-mono transition-colors"
            >
              <span className={
                isError ? 'text-[#dc2626]' :
                isGiven ? 'text-[#141414] font-medium' :
                value ? 'text-[#6C6C6C]' : ''
              }>
                {value || ''}
              </span>
            </button>
          )
        })}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={reset}
          className="text-xs font-mono text-[#6C6C6C] hover:text-[#141414] transition-colors underline underline-offset-2"
        >
          New puzzle
        </button>
        {solved && (
          <span className="text-xs font-mono text-[#16a34a] tracking-wide">Solved!</span>
        )}
        {!solved && errors.size > 0 && (
          <span className="text-xs font-mono text-[#ABABAB]">{errors.size} error{errors.size !== 1 ? 's' : ''}</span>
        )}
      </div>
    </div>
  )
}
