" Open an isolated scratch buffer. Draft content is data, never Ex commands.
set encoding=utf-8 nomodeline noswapfile nobackup noundofile
setlocal buftype=nofile bufhidden=wipe nospell wrap linebreak
set laststatus=0 noruler noshowmode
let s:items = json_decode(join(readfile($DISLOP_PICKER_DIR . '/items.json'), "\n"))
let s:current = 0
let s:accepted = {}
let s:rejected = {}

highlight DislopTitle term=bold cterm=bold gui=bold
if &background ==# 'light'
  highlight DislopRemoved term=underline cterm=bold ctermfg=DarkRed guifg=#9c2434 gui=bold
  highlight DislopAdded term=bold cterm=bold ctermfg=DarkGreen guifg=#176438 gui=bold
  highlight DislopLabel term=bold cterm=bold ctermfg=DarkCyan guifg=#225d74 gui=bold
else
  highlight DislopRemoved term=underline cterm=bold ctermfg=LightRed guifg=#ff9090 gui=bold
  highlight DislopAdded term=bold cterm=bold ctermfg=LightGreen guifg=#91db9a gui=bold
  highlight DislopLabel term=bold cterm=bold ctermfg=LightCyan guifg=#8dd8e8 gui=bold
endif

function! s:Section(lines, label, text) abort
  if empty(a:text) | return | endif
  call add(a:lines, a:label)
  call matchaddpos('DislopLabel', [len(a:lines)])
  call extend(a:lines, split(a:text, '\r\?\n', 1) + [''])
endfunction

function! s:Diff(lines, sign, group, item, text) abort
  let parts = split(a:text, '\r\?\n', 1)
  let positions = []
  for i in range(len(parts))
    let prefix = i == 0 ? a:item.prefix : ''
    let suffix = i == len(parts) - 1 ? a:item.suffix : ''
    call add(a:lines, a:sign . ' ' . prefix . parts[i] . suffix)
    let row = len(a:lines)
    call add(positions, [row, 1, 1])
    if !empty(parts[i])
      " Vim match columns count bytes, including the gutter and any UTF-8 context.
      call add(positions, [row, 3 + strlen(prefix), strlen(parts[i])])
    endif
  endfor
  " Older Vim versions accept at most eight positions per match.
  for i in range(0, len(positions) - 1, 8)
    call matchaddpos(a:group, positions[i : i + 7])
  endfor
endfunction

function! s:Render() abort
  let item = s:items[s:current]
  let id = string(item.id)
  let state = !has_key(item, 'after') ? 'advice' : has_key(s:accepted, id) ? 'accepted' : has_key(s:rejected, id) ? 'rejected' : 'undecided'
  let zh = $DISLOP_PICKER_LANG ==# 'zh'
  if zh
    let labels = {'advice': '建议', 'accepted': '已采纳', 'rejected': '已跳过', 'undecided': '待选择'}
    let title = printf('第 %d / %d 条   [%s]   已采纳 %d 条', item.id, len(s:items), labels[state], len(s:accepted))
    let keys = 'j/k 或方向键：切换   y/n：采纳或跳过   回车：写入已选修改   q：放弃退出'
  else
    let title = printf('Review %d of %d   [%s]   %d accepted', item.id, len(s:items), state, len(s:accepted))
    let keys = 'j/k or arrows: move   y/n: accept/reject   Enter: apply accepted   q: cancel'
  endif
  call clearmatches()
  let lines = [title, keys, '']
  call matchaddpos('DislopTitle', [[1, 1, stridx(title, '   ')]])
  let groups = {'accepted': 'DislopAdded', 'rejected': 'DislopRemoved', 'undecided': 'DislopTitle', 'advice': 'DislopLabel'}
  let badge = matchstr(title, '\[[^]]*\]')
  call matchaddpos(groups[state], [[1, stridx(title, badge) + 1, strlen(badge)]])
  call s:Section(lines, zh ? '原因' : 'Why', item.why)
  if has_key(item, 'after')
    call s:Diff(lines, '-', 'DislopRemoved', item, item.before)
    call s:Diff(lines, '+', 'DislopAdded', item, item.after)
  else
    call s:Section(lines, zh ? '原文' : 'Original', item.quote)
    call s:Section(lines, zh ? '建议' : 'Advice', item.advice)
  endif
  setlocal modifiable
  silent %delete _
  call setline(1, lines)
  setlocal nomodifiable nomodified
  normal! gg
endfunction

function! s:Move(step) abort
  let s:current = max([0, min([len(s:items)-1, s:current + a:step])])
  call s:Render()
endfunction

function! s:Decide(accept) abort
  let item = s:items[s:current]
  if has_key(item, 'after')
    let id = string(item.id)
    let keep = a:accept ? s:accepted : s:rejected
    let drop = a:accept ? s:rejected : s:accepted
    let keep[id] = item.id
    if has_key(drop, id) | call remove(drop, id) | endif
  endif
  call s:Move(1)
endfunction

function! s:Finish() abort
  if writefile([json_encode(values(s:accepted))], $DISLOP_PICKER_DIR . '/selected') != 0
    cquit
  endif
  qall!
endfunction

nnoremap <silent><buffer> j :call <SID>Move(1)<CR>
nnoremap <silent><buffer> k :call <SID>Move(-1)<CR>
nmap <buffer> <Down> j
nmap <buffer> <Up> k
nnoremap <silent><buffer> y :call <SID>Decide(1)<CR>
nnoremap <silent><buffer> n :call <SID>Decide(0)<CR>
nnoremap <silent><buffer> <CR> :call <SID>Finish()<CR>
nnoremap <silent><buffer> q :qall!<CR>
call s:Render()
