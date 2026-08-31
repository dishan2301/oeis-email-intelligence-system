import {createTheme} from '@mui/material/styles';

export const theme=createTheme({
  palette:{mode:'light',background:{default:'#EEF3F9',paper:'#FFFFFF'},primary:{main:'#102A43',light:'#DCE9F7',dark:'#071B2E'},secondary:{main:'#F2A93B'},info:{main:'#2F6FED'},success:{main:'#12866A'},warning:{main:'#D97706'},error:{main:'#D14343'},text:{primary:'#0B1F38',secondary:'#52677E'},divider:'#D7E1EC'},
  shape:{borderRadius:16},
  typography:{fontFamily:'"Plus Jakarta Sans","Aptos","Segoe UI",sans-serif',h4:{fontWeight:800,letterSpacing:'-.045em',lineHeight:1.08},h5:{fontWeight:800,letterSpacing:'-.03em'},h6:{fontWeight:800,letterSpacing:'-.02em'},button:{fontWeight:750,letterSpacing:'-.01em'}},
  components:{
    MuiCard:{styleOverrides:{root:{border:'1px solid #D9E3EE',boxShadow:'0 12px 36px rgba(18,45,74,.07)',backgroundImage:'none'}}},
    MuiButton:{styleOverrides:{root:{textTransform:'none',minHeight:42,borderRadius:12,paddingInline:16},contained:{boxShadow:'0 8px 22px rgba(47,111,237,.2)'}}},
    MuiTextField:{defaultProps:{variant:'outlined'}},
    MuiOutlinedInput:{styleOverrides:{root:{borderRadius:12,background:'#FFFFFF',transition:'box-shadow .2s ease,border-color .2s ease','&.Mui-focused':{boxShadow:'0 0 0 4px rgba(47,111,237,.10)'}}}},
    MuiChip:{styleOverrides:{root:{fontWeight:750,borderRadius:10}}},
    MuiDialog:{styleOverrides:{paper:{borderRadius:22,border:'1px solid #D9E3EE',boxShadow:'0 32px 90px rgba(7,27,46,.25)'}}},
    MuiTooltip:{styleOverrides:{tooltip:{fontSize:12,borderRadius:8,padding:'8px 10px'}}}
  }
});
