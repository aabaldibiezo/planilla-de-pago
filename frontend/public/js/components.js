(function(){
  const escapeHtml=value=>String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  function enhanceEmployeeSelect(select){
    if(!select||select.dataset.searchable==='true')return; select.dataset.searchable='true';
    const wrapper=document.createElement('div');wrapper.className='employee-combobox';select.parentNode.insertBefore(wrapper,select);wrapper.appendChild(select);select.classList.add('sr-only-select');
    const input=document.createElement('input');input.type='text';input.className='form-control employee-search';input.placeholder='Escriba para buscar empleado…';input.setAttribute('role','combobox');input.setAttribute('aria-expanded','false');
    const list=document.createElement('div');list.className='employee-options hidden';list.setAttribute('role','listbox');wrapper.insertBefore(input,select);wrapper.appendChild(list);
    const options=()=>[...select.options].map(o=>({value:o.value,label:o.textContent.trim()}));
    const draw=()=>{const q=input.value.toLocaleLowerCase('es');const found=options().filter(o=>!q||o.label.toLocaleLowerCase('es').includes(q));list.innerHTML=found.map((o,i)=>`<button type="button" role="option" class="employee-option${i===0?' active':''}" data-value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</button>`).join('')||'<span class="employee-empty">Sin resultados</span>';list.classList.remove('hidden');input.setAttribute('aria-expanded','true')};
    input.addEventListener('focus',draw);input.addEventListener('input',draw);input.addEventListener('keydown',e=>{const items=[...list.querySelectorAll('button')];let i=items.findIndex(x=>x.classList.contains('active'));if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();items[i]?.classList.remove('active');i=e.key==='ArrowDown'?Math.min(i+1,items.length-1):Math.max(i-1,0);items[i]?.classList.add('active');items[i]?.scrollIntoView({block:'nearest'})}else if(e.key==='Enter'&&items[i]){e.preventDefault();items[i].click()}else if(e.key==='Escape'){list.classList.add('hidden')}});
    list.addEventListener('click',e=>{const option=e.target.closest('.employee-option');if(!option)return;select.value=option.dataset.value;select.dispatchEvent(new Event('change',{bubbles:true}));input.value=option.textContent;list.classList.add('hidden');input.setAttribute('aria-expanded','false')});
    document.addEventListener('click',e=>{if(!wrapper.contains(e.target))list.classList.add('hidden')});
  }
  window.UI={escapeHtml,enhanceEmployeeSelect,enhanceEmployeeSelectors(root=document){root.querySelectorAll('#filter-user,#att-user,#history-user,#entry-user,[data-employee-select]').forEach(enhanceEmployeeSelect)}};
})();
